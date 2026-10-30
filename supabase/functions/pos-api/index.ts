import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://app.web2table.io","https://jrnotjunior.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
type Rec = Record<string, unknown>;

type JsonObjectRead = { ok: true; value: Rec } | { ok: false; reason: "too_large" | "invalid" };

async function readJsonObject(req: Request, maxBytes: number): Promise<JsonObjectRead> {
  if (!req.body) return { ok: false, reason: "invalid" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, value: parsed as Rec };
  } catch {
    return { ok: false, reason: "invalid" };
  } finally {
    reader.releaseLock();
  }
}

function response(req: Request, body: unknown, status = 200, requestId = crypto.randomUUID()) {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string,string> = {
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
    "Access-Control-Max-Age":"600","Vary":"Origin",
    "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","X-Request-Id":requestId
  };
  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return new Response(JSON.stringify(body),{status,headers});
}
const err = (code:string,message:string,requestId:string) => ({error:{code,message,requestId}});
function serviceKey():string {
  try { const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}"); return typeof keys.default==="string" ? keys.default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""; }
  catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""; }
}
function claims(token:string):Rec|null {
  try { const part=token.split(".")[1]; if(!part)return null; const s=part.replace(/-/g,"+").replace(/_/g,"/"); const parsed:unknown=JSON.parse(atob(s.padEnd(Math.ceil(s.length/4)*4,"="))); return typeof parsed==="object"&&parsed!==null&&!Array.isArray(parsed)?parsed as Rec:null; } catch { return null; }
}
function displayName(user:{user_metadata?:Rec;app_metadata?:Rec}):string {
  const m=user.user_metadata??{};
  const first=typeof m.first_name==="string"?m.first_name.trim():"";
  const last=typeof m.last_name==="string"?m.last_name.trim():"";
  if(first||last)return [first,last].filter(Boolean).join(" ").slice(0,120);
  for(const k of ["full_name","name","display_name"])if(typeof m[k]==="string"&&(m[k] as string).trim())return (m[k] as string).trim().slice(0,120);
  const app=user.app_metadata?.full_name;
  return typeof app==="string"&&app.trim()?app.trim().slice(0,120):"Staff member";
}
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async(req:Request)=>{
  const requestId=crypto.randomUUID();
  if(req.method==="OPTIONS")return response(req,{ok:true},200,requestId);
  if(req.method!=="GET"&&req.method!=="POST")return response(req,err("VALIDATION_ERROR","Only GET and POST requests are supported.",requestId),405,requestId);
  const origin=req.headers.get("Origin");
  if(origin&&!allowedOrigins.has(origin))return response(req,err("FORBIDDEN","This origin is not allowed to access the POS API.",requestId),403,requestId);
  const token=(req.headers.get("Authorization")??"").match(/^Bearer\s+(.+)$/i)?.[1]??"";
  if(!token)return response(req,err("UNAUTHENTICATED","Sign in to access the POS.",requestId),401,requestId);
  const url=Deno.env.get("SUPABASE_URL")??"",key=serviceKey();
  if(!url||!key){console.error(JSON.stringify({event:"pos_api_misconfigured",requestId}));return response(req,err("INTERNAL_ERROR","The POS service is not configured.",requestId),500,requestId);}
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  try {
    const {data:auth,error:authError}=await admin.auth.getUser(token);
    if(authError||!auth.user)return response(req,err("UNAUTHENTICATED","Your session is invalid or expired. Sign in again.",requestId),401,requestId);
    if(claims(token)?.aal!=="aal2")return response(req,err("FORBIDDEN","Complete multi-factor authentication before accessing the POS.",requestId),403,requestId);
    const path=new URL(req.url).pathname;
    const isSession=req.method==="GET"&&(path.endsWith("/api/pos/v1/session")||path.endsWith("/session"));
    const match=path.match(/\/branches\/([^/]+)\/menu$/);
    const salesMatch=path.match(/\/branches\/([^/]+)\/sales$/);
    const isMenu=req.method==="GET"&&Boolean(match)&&(path.includes("/api/pos/v1/")||path.includes("/pos-api/"));
    const isSalesHistory=req.method==="GET"&&Boolean(salesMatch)&&(path.includes("/api/pos/v1/")||path.includes("/pos-api/"));
    const isOrders=req.method==="GET"&&path.endsWith("/api/pos/v1/orders");
    const isOrderTransition=req.method==="POST"&&path.endsWith("/api/pos/v1/orders/transition");
    const isSale=req.method==="POST"&&path.endsWith("/api/pos/v1/sales");
    const isShiftGet=req.method==="GET"&&path.endsWith("/api/pos/v1/shift");
    const isShiftOpen=req.method==="POST"&&path.endsWith("/api/pos/v1/shift/open");
    const isShiftClose=req.method==="POST"&&path.endsWith("/api/pos/v1/shift/close");
    const isFiscalProfileGet=req.method==="GET"&&path.endsWith("/api/pos/v1/fiscal-profile");
    const isFiscalProfileSave=req.method==="POST"&&path.endsWith("/api/pos/v1/fiscal-profile");
    const isFiscalTaxPoliciesGet=req.method==="GET"&&path.endsWith("/api/pos/v1/fiscal-tax-policies");
    const isFiscalTaxPolicyCreate=req.method==="POST"&&path.endsWith("/api/pos/v1/fiscal-tax-policies");
    const isLoyaltyBalance=req.method==="GET"&&path.endsWith("/api/pos/v1/loyalty/balance");
    const isLoyaltyCustomerSearch=req.method==="GET"&&path.endsWith("/api/pos/v1/loyalty/customers");
    if(!isSession&&!isMenu&&!isSalesHistory&&!isOrders&&!isOrderTransition&&!isSale&&!isShiftGet&&!isShiftOpen&&!isShiftClose&&!isFiscalProfileGet&&!isFiscalProfileSave&&!isFiscalTaxPoliciesGet&&!isFiscalTaxPolicyCreate&&!isLoyaltyBalance&&!isLoyaltyCustomerSearch)return response(req,err("NOT_FOUND","The requested POS endpoint was not found.",requestId),404,requestId);
    if(isShiftGet||isShiftOpen||isShiftClose){
      let body:Rec={};
      if(isShiftOpen||isShiftClose){
        const parsedBody = await readJsonObject(req, 10000);
        if (!parsedBody.ok) {
          const tooLarge = parsedBody.reason === "too_large";
          return response(req, err("VALIDATION_ERROR", tooLarge ? "The shift request is too large." : "Provide a valid JSON shift request.", requestId), tooLarge ? 413 : 400, requestId);
        }
        body = parsedBody.value;
      }
      const branchId=typeof (isShiftGet?new URL(req.url).searchParams.get("branchId"):body.branchId)==="string"
        ? String(isShiftGet?new URL(req.url).searchParams.get("branchId"):body.branchId) : "";
      if(!uuid(branchId))return response(req,err("VALIDATION_ERROR","A valid branch identifier is required.",requestId),400,requestId);
      let rpcName:string, rpcArgs:Rec;
      if(isShiftGet){rpcName="get_pos_cashier_shift";rpcArgs={p_actor_user_id:auth.user.id,p_branch_id:branchId};}
      else if(isShiftOpen){
        const opening=body.openingCashCentavos;
        if(!Number.isSafeInteger(opening)||Number(opening)<0||Number(opening)>2000000000)
          return response(req,err("VALIDATION_ERROR","Opening cash must be a valid amount in centavos.",requestId),400,requestId);
        rpcName="open_pos_cashier_shift";rpcArgs={p_actor_user_id:auth.user.id,p_branch_id:branchId,p_opening_cash_centavos:Number(opening)};
      }else{
        const counted=body.countedCashCentavos;
        if(!Number.isSafeInteger(counted)||Number(counted)<0||Number(counted)>2000000000)
          return response(req,err("VALIDATION_ERROR","Counted cash must be a valid amount in centavos.",requestId),400,requestId);
        rpcName="close_pos_cashier_shift";rpcArgs={p_actor_user_id:auth.user.id,p_branch_id:branchId,p_counted_cash_centavos:Number(counted),p_close_note:typeof body.closeNote==="string"?body.closeNote.slice(0,500):null};
      }
      const {data:shift,error:shiftError}=await admin.rpc(rpcName,rpcArgs);
      if(shiftError){
        const code=(shiftError as unknown as Rec).code;
        if(code==="42501")return response(req,err("FORBIDDEN","You do not have permission to perform this shift action.",requestId),403,requestId);
        if(code==="22023")return response(req,err("VALIDATION_ERROR","The shift request could not be accepted.",requestId),400,requestId);
        if(code==="23505")return response(req,err("CONFLICT","The cashier shift state has changed. Refresh and try again.",requestId),409,requestId);
        if(code==="P0002")return response(req,err("CONFLICT","The cashier shift state has changed. Refresh and try again.",requestId),409,requestId);
        throw shiftError;
      }
      return response(req,{data:shift,requestId},isShiftOpen?201:200,requestId);
    }
    if(isSale){
      const parsedBody = await readJsonObject(req, 50000);
      if (!parsedBody.ok) {
        const tooLarge = parsedBody.reason === "too_large";
        return response(req, err("VALIDATION_ERROR", tooLarge ? "The sale request is too large." : "Provide a valid JSON sale request.", requestId), tooLarge ? 413 : 400, requestId);
      }
      const body = parsedBody.value;
      const branchId=typeof body.branchId==="string"?body.branchId:"";
      const idempotencyKey=typeof body.idempotencyKey==="string"?body.idempotencyKey:"";
      const cashTendered=body.cashTenderedCentavos;
      if(!uuid(branchId)||!uuid(idempotencyKey)||!Number.isSafeInteger(cashTendered)||Number(cashTendered)<1||Number(cashTendered)>2000000000||!Array.isArray(body.items)||body.items.length<1||body.items.length>50)
        return response(req,err("VALIDATION_ERROR","Branch, request key, cash received, and sale items are required.",requestId),400,requestId);
      const saleItems:Rec[]=[];
      for(const value of body.items){
        if(typeof value!=="object"||value===null||Array.isArray(value))return response(req,err("VALIDATION_ERROR","A sale item is invalid.",requestId),400,requestId);
        const line=value as Rec;
        if(typeof line.itemId!=="string"||!uuid(line.itemId)||!Number.isSafeInteger(line.quantity)||Number(line.quantity)<1||Number(line.quantity)>100)
          return response(req,err("VALIDATION_ERROR","A sale item or quantity is invalid.",requestId),400,requestId);
        saleItems.push({item_id:line.itemId,quantity:line.quantity});
      }
      const {data:sale,error:saleError}=await admin.rpc("create_pos_cash_sale",{
        p_actor_user_id:auth.user.id,p_branch_id:branchId,p_idempotency_key:idempotencyKey,
        p_items:saleItems,p_cash_tendered_centavos:Number(cashTendered)
      });
      if(saleError){
        const code=(saleError as unknown as Rec).code;
        if(code==="42501")return response(req,err("FORBIDDEN","You do not have permission to create this sale.",requestId),403,requestId);
        if(code==="22023")return response(req,err("VALIDATION_ERROR","The sale request could not be accepted.",requestId),400,requestId);
        if(code==="P0002")return response(req,err("CONFLICT","The sale could not be completed because the requested records changed.",requestId),409,requestId);
        throw saleError;
      }
      // The SQL RPC returns sale_id/sale_number, not the full public sale DTO.
      // Re-read the persisted row so both first-time and idempotent retries return
      // the same stable contract to the POS client.
      const saleId=typeof sale?.sale_id==="string"?sale.sale_id:"";
      if(!uuid(saleId))throw new Error("cash_sale_rpc_missing_sale_id");
      const {data:savedSale,error:savedSaleError}=await admin.from("pos_sales")
        .select("id,sale_number,subtotal_centavos,total_centavos,payment_method,payment_status,cash_tendered_centavos,change_centavos,created_at")
        .eq("id",saleId).eq("tenant_id",context.tenantId).eq("branch_id",branchId).maybeSingle();
      if(savedSaleError)throw savedSaleError;
      if(!savedSale)throw new Error("cash_sale_persisted_record_not_found");
      // Return only database-persisted line snapshots. Receipt printing must not depend
      // on a subsequent history refresh or reconstruct amounts from the browser cart.
      const {data:savedLines,error:savedLinesError}=await admin.from("pos_sale_items")
        .select("line_number,item_name_snapshot,unit_price_centavos,quantity,line_total_centavos")
        .eq("tenant_id",context.tenantId).eq("sale_id",saleId)
        .order("line_number",{ascending:true});
      if(savedLinesError)throw savedLinesError;
      if(!savedLines||savedLines.length===0)throw new Error("cash_sale_persisted_lines_not_found");
      return response(req,{data:{...savedSale,items:savedLines},requestId},201,requestId);
    }
    let orderActionBody:Rec={};
    if(isOrderTransition){
      const parsedBody = await readJsonObject(req, 10000);
      if (!parsedBody.ok) {
        const tooLarge = parsedBody.reason === "too_large";
        return response(req, err("VALIDATION_ERROR", tooLarge ? "The order action request is too large." : "Provide a valid JSON order action.", requestId), tooLarge ? 413 : 400, requestId);
      }
      orderActionBody = parsedBody.value;
      if(typeof orderActionBody.orderId!=="string"||!uuid(orderActionBody.orderId)||!["confirm","reject","cancel"].includes(String(orderActionBody.action)))
        return response(req,err("VALIDATION_ERROR","A valid order and supported cashier action are required.",requestId),400,requestId);
    }
    let fiscalProfileBody:Rec={};
    let fiscalTaxPolicyBody:Rec={};
    if(isFiscalTaxPolicyCreate){
      const parsedBody=await readJsonObject(req,30000);
      if(!parsedBody.ok){
        const tooLarge=parsedBody.reason==="too_large";
        return response(req,err("VALIDATION_ERROR",tooLarge?"The fiscal tax policy request is too large.":"Provide a valid JSON tax policy.",requestId),tooLarge?413:400,requestId);
      }
      fiscalTaxPolicyBody=parsedBody.value;
    }
    if(isFiscalProfileSave){
      const parsedBody=await readJsonObject(req,20000);
      if(!parsedBody.ok){
        const tooLarge=parsedBody.reason==="too_large";
        return response(req,err("VALIDATION_ERROR",tooLarge?"The fiscal profile request is too large.":"Provide a valid JSON fiscal profile.",requestId),tooLarge?413:400,requestId);
      }
      fiscalProfileBody=parsedBody.value;
    }
    // Owners can access active branches in their tenant. Cashiers must have an
    // explicit branch_memberships row; tenant membership alone is insufficient.
    const {data:memberships,error:membershipError}=await admin.from("tenant_memberships").select("tenant_id,role").eq("user_id",auth.user.id).eq("status","active").in("role",["restaurant_owner","cashier"]).limit(50);
    if(membershipError)throw membershipError;
    if(!memberships?.length)return response(req,err("FORBIDDEN","Your account does not have an active owner or cashier POS permission.",requestId),403,requestId);
    // Resolve owner membership first when a user has more than one active role
    // in the same tenant. This avoids arbitrary role selection from query order.
    memberships.sort((a:Rec,b:Rec)=>Number(b.role==="restaurant_owner")-Number(a.role==="restaurant_owner"));
    const ordersBranch=new URL(req.url).searchParams.get("branchId")??"";
    const requestedBranch=match?decodeURIComponent(match[1]):salesMatch?decodeURIComponent(salesMatch[1]):(isOrders||isFiscalProfileGet||isFiscalTaxPoliciesGet||isLoyaltyBalance||isLoyaltyCustomerSearch)?ordersBranch:(isOrderTransition?String(orderActionBody.branchId??""):isFiscalProfileSave?String(fiscalProfileBody.branchId??""):(isFiscalTaxPolicyCreate?String(fiscalTaxPolicyBody.branchId??""):""));
    if((isMenu||isSalesHistory||isOrders||isOrderTransition||isFiscalProfileGet||isFiscalProfileSave||isFiscalTaxPoliciesGet||isFiscalTaxPolicyCreate||isLoyaltyBalance||isLoyaltyCustomerSearch)&&!uuid(requestedBranch))return response(req,err("VALIDATION_ERROR","A valid branch identifier is required.",requestId),400,requestId);
    let context:{tenantId:string;tenantName:string;branchId:string;branchName:string}|null=null;
    for(const m of memberships){
      const {data:t,error:te}=await admin.from("tenants").select("id,name").eq("id",m.tenant_id).eq("status","active").maybeSingle();
      if(te)throw te;if(!t)continue;
      let q=admin.from("branches").select("id,tenant_id,name").eq("tenant_id",t.id).eq("is_active",true);
      if(isMenu||isSalesHistory||isOrders||isOrderTransition||isFiscalProfileGet||isFiscalProfileSave||isFiscalTaxPoliciesGet||isFiscalTaxPolicyCreate||isLoyaltyBalance||isLoyaltyCustomerSearch)q=q.eq("id",requestedBranch);
      if(m.role==="cashier") {
        const {data:assigned,error:assignedError}=await admin.from("branch_memberships").select("branch_id").eq("tenant_id",t.id).eq("user_id",auth.user.id);
        if(assignedError)throw assignedError;
        const branchIds=(assigned??[]).map((row:Rec)=>row.branch_id).filter((id):id is string=>typeof id==="string");
        if(!branchIds.length)continue;
        q=q.in("id",branchIds);
      }
      const {data:b,error:be}=await q.order("created_at",{ascending:true}).limit(1).maybeSingle();
      if(be)throw be;
      if(b){context={tenantId:t.id,tenantName:t.name,branchId:b.id,branchName:b.name};break;}
    }
    if(!context)return response(req,err(isMenu||isSalesHistory||isOrders||isOrderTransition?"NOT_FOUND":"FORBIDDEN",isMenu||isSalesHistory||isOrders||isOrderTransition?"The requested branch is unavailable or not authorized.":"No active branch is available for your restaurant account.",requestId),isMenu||isSalesHistory||isOrders||isOrderTransition?404:403,requestId);
    const role=memberships.find((m:Rec)=>m.tenant_id===context!.tenantId)?.role;
    if(isSession){
      // Return only active branches the resolved membership can access. Owners
      // may choose any active branch in their tenant; cashiers require an
      // explicit branch_memberships row. Branch-specific routes independently
      // validate the requested branch against this same authorization policy.
      let branchQuery=admin.from("branches").select("id,name,slug,timezone")
        .eq("tenant_id",context.tenantId).eq("is_active",true).order("created_at",{ascending:true});
      if(role!=="restaurant_owner"){
        const {data:assigned,error:assignedError}=await admin.from("branch_memberships")
          .select("branch_id").eq("tenant_id",context.tenantId).eq("user_id",auth.user.id);
        if(assignedError)throw assignedError;
        const branchIds=(assigned??[]).map((row:Rec)=>row.branch_id).filter((id):id is string=>typeof id==="string");
        branchQuery=branchIds.length?branchQuery.in("id",branchIds):branchQuery.eq("id","00000000-0000-0000-0000-000000000000");
      }
      const {data:authorizedBranches,error:branchesError}=await branchQuery.limit(100);
      if(branchesError)throw branchesError;
      const branches=(authorizedBranches??[]).map((branch:Rec)=>({id:branch.id,name:branch.name,slug:branch.slug,timezone:typeof branch.timezone==="string"?branch.timezone:"Asia/Manila"}));
      return response(req,{data:{userId:auth.user.id,displayName:displayName(auth.user),tenantId:context.tenantId,tenantName:context.tenantName,branchId:context.branchId,branchName:context.branchName,branches,role,permissions:["pos.session.read","pos.menu.read","pos.sales.read","pos.sale.create"]},requestId},200,requestId);
    }
    if(isLoyaltyCustomerSearch){
      const params=new URL(req.url).searchParams;
      const query=(params.get("q")??"").trim();
      if(query.length<2||query.length>80)return response(req,err("VALIDATION_ERROR","Enter at least 2 characters to search customers.",requestId),400,requestId);
      const safeQuery=query.replace(/[,%()]/g," ").trim();
      const {data:rows,error:searchError}=await admin.from("customer_orders")
        .select("customer_user_id,customer_name,customer_phone_normalized,created_at")
        .eq("tenant_id",context.tenantId).eq("branch_id",context.branchId)
        .not("customer_user_id","is",null)
        .or("customer_name.ilike.%"+safeQuery+"%,customer_phone_normalized.ilike.%"+safeQuery+"%")
        .order("created_at",{ascending:false}).limit(100);
      if(searchError)throw searchError;
      const unique=new Map<string,Rec>();
      for(const row of rows??[]){
        const id=typeof row.customer_user_id==="string"?row.customer_user_id:"";
        if(!uuid(id)||unique.has(id))continue;
        unique.set(id,{customerUserId:id,displayName:String(row.customer_name??"Customer"),phoneLastFour:String(row.customer_phone_normalized??"").slice(-4)});
        if(unique.size>=20)break;
      }
      return response(req,{data:Array.from(unique.values()),requestId},200,requestId);
    }
    if(isLoyaltyBalance){
      const params=new URL(req.url).searchParams;
      const customerUserId=params.get("customerUserId")??"";
      if(!uuid(customerUserId))return response(req,err("VALIDATION_ERROR","A valid customer identity is required.",requestId),400,requestId);
      const {data:account,error:accountError}=await admin.from("tenant_customer_loyalty_accounts")
        .select("points_balance,lifetime_points_earned,lifetime_points_redeemed,eligible_spend_centavos,updated_at")
        .eq("tenant_id",context.tenantId).eq("customer_user_id",customerUserId).maybeSingle();
      if(accountError)throw accountError;
      const {data:settings,error:settingsError}=await admin.from("tenant_loyalty_settings")
        .select("enabled,amount_threshold,points_awarded,redemption_enabled,redemption_points,redemption_amount")
        .eq("tenant_id",context.tenantId).maybeSingle();
      if(settingsError)throw settingsError;
      return response(req,{data:{customerUserId,account:account??{points_balance:0,lifetime_points_earned:0,lifetime_points_redeemed:0,eligible_spend_centavos:0,updated_at:null},settings:settings??{enabled:false,amount_threshold:null,points_awarded:0,redemption_enabled:false,redemption_points:0,redemption_amount:null}},requestId},200,requestId);
    }
    if(isFiscalProfileGet||isFiscalProfileSave){
      if(role!=="restaurant_owner")return response(req,err("FORBIDDEN","Only a restaurant owner can manage taxpayer fiscal configuration.",requestId),403,requestId);
      if(isFiscalProfileGet){
        const {data:profile,error:profileError}=await admin.from("pos_fiscal_profiles")
          .select("id,tenant_id,branch_id,taxpayer_registered_name,trade_name,taxpayer_tin,tin_branch_code,registered_address,tax_regime,invoice_document_type,invoice_series_prefix,fiscal_status,authorization_reference,authorization_effective_at,authorization_expires_at,authorized_at,software_name,software_version,machine_or_terminal_identifier,created_at,updated_at")
          .eq("tenant_id",context.tenantId).eq("branch_id",context.branchId).maybeSingle();
        if(profileError)throw profileError;
        return response(req,{data:profile,requestId},200,requestId);
      }
      const body=fiscalProfileBody;
      const stringField=(key:string,max:number,required=true):string|null=>{
        const raw=body[key];
        if(raw===undefined||raw===null){return required?null:"";}
        if(typeof raw!=="string")return null;
        const value=raw.trim();
        if((required&&value.length===0)||value.length>max)return null;
        return value;
      };
      const taxpayerRegisteredName=stringField("taxpayerRegisteredName",200);
      const tradeName=stringField("tradeName",200,false);
      const taxpayerTin=stringField("taxpayerTin",12);
      const tinBranchCode=stringField("tinBranchCode",3);
      const registeredAddress=stringField("registeredAddress",500);
      const invoiceSeriesPrefix=stringField("invoiceSeriesPrefix",20);
      const softwareName=stringField("softwareName",160);
      const softwareVersion=stringField("softwareVersion",80);
      const machineOrTerminalIdentifier=stringField("machineOrTerminalIdentifier",160,false);
      const taxRegime=body.taxRegime;
      if(!taxpayerRegisteredName||taxpayerRegisteredName.length<2||!taxpayerTin||!/^[0-9]{9,12}$/.test(taxpayerTin)
        ||!tinBranchCode||!/^[0-9]{3}$/.test(tinBranchCode)||!registeredAddress||registeredAddress.length<5
        ||!["vat_registered","non_vat","other_requires_review"].includes(String(taxRegime))
        ||!invoiceSeriesPrefix||!/^[A-Z0-9-]{1,20}$/.test(invoiceSeriesPrefix)
        ||!softwareName||softwareName.length<2||!softwareVersion
        ||(tradeName===null)||(machineOrTerminalIdentifier===null))
        return response(req,err("VALIDATION_ERROR","Check the taxpayer details, tax regime, invoice series, and software identity fields.",requestId),400,requestId);
      const {data:existing,error:existingError}=await admin.from("pos_fiscal_profiles").select("id,created_by")
        .eq("tenant_id",context.tenantId).eq("branch_id",context.branchId).maybeSingle();
      if(existingError)throw existingError;
      const profileValues={
        tenant_id:context.tenantId,branch_id:context.branchId,
        taxpayer_registered_name:taxpayerRegisteredName,trade_name:tradeName||null,
        taxpayer_tin:taxpayerTin,tin_branch_code:tinBranchCode,registered_address:registeredAddress,
        tax_regime:String(taxRegime),invoice_document_type:"invoice",invoice_series_prefix:invoiceSeriesPrefix,
        fiscal_status:"draft",authorization_reference:null,authorization_effective_at:null,
        authorization_expires_at:null,authorized_by:null,authorized_at:null,
        software_name:softwareName,software_version:softwareVersion,
        machine_or_terminal_identifier:machineOrTerminalIdentifier||null,
        additional_authorization_metadata:{},created_by:existing?.created_by??auth.user.id,updated_by:auth.user.id
      };
      const {data:profile,error:saveError}=await admin.from("pos_fiscal_profiles")
        .upsert(profileValues,{onConflict:"tenant_id,branch_id"})
        .select("id,tenant_id,branch_id,taxpayer_registered_name,trade_name,taxpayer_tin,tin_branch_code,registered_address,tax_regime,invoice_document_type,invoice_series_prefix,fiscal_status,authorization_reference,authorization_effective_at,authorization_expires_at,authorized_at,software_name,software_version,machine_or_terminal_identifier,created_at,updated_at")
        .single();
      if(saveError)throw saveError;
      return response(req,{data:profile,requestId},200,requestId);
    }

    if(isFiscalTaxPoliciesGet||isFiscalTaxPolicyCreate){
      if(role!=="restaurant_owner")return response(req,err("FORBIDDEN","Only a restaurant owner can manage fiscal tax policies.",requestId),403,requestId);
      const {data:profile,error:profileError}=await admin.from("pos_fiscal_profiles").select("id")
        .eq("tenant_id",context.tenantId).eq("branch_id",context.branchId).maybeSingle();
      if(profileError)throw profileError;
      if(!profile)return response(req,err("CONFLICT","Save the taxpayer profile before configuring a tax policy.",requestId),409,requestId);
      if(isFiscalTaxPoliciesGet){
        const {data:policies,error:policiesError}=await admin.from("pos_fiscal_tax_policies")
          .select("id,tenant_id,branch_id,fiscal_profile_id,policy_name,policy_version,status,effective_from,effective_until,currency_code,rounding_mode,rules,review_reference,reviewed_by,reviewed_at,created_at,updated_at")
          .eq("tenant_id",context.tenantId).eq("branch_id",context.branchId).order("policy_version",{ascending:false}).limit(50);
        if(policiesError)throw policiesError;
        return response(req,{data:policies??[],requestId},200,requestId);
      }
      const body=fiscalTaxPolicyBody;
      const policyName=typeof body.policyName==="string"?body.policyName.trim():"";
      const rules=body.rules;
      const effectiveFrom=typeof body.effectiveFrom==="string"?body.effectiveFrom.trim():"";
      const effectiveUntil=typeof body.effectiveUntil==="string"&&body.effectiveUntil.trim()?body.effectiveUntil.trim():null;
      const isoDate=(v:string)=>{
        const match=v.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/);
        if(!match||!Number.isFinite(Date.parse(v)))return false;
        const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
        const calendarDate=new Date(Date.UTC(year,month-1,day));
        return calendarDate.getUTCFullYear()===year&&calendarDate.getUTCMonth()===month-1&&calendarDate.getUTCDate()===day
          &&month>=1&&month<=12&&day>=1;
      };
      if(policyName.length<2||policyName.length>120||!Array.isArray(rules)||rules.length<1||rules.length>50
        ||!isoDate(effectiveFrom)||(effectiveUntil!==null&&!isoDate(effectiveUntil))
        ||(effectiveFrom&&effectiveUntil&&Date.parse(effectiveUntil)<=Date.parse(effectiveFrom))){
        return response(req,err("VALIDATION_ERROR","Provide a policy name, one to fifty explicit tax rules, and valid effective dates.",requestId),400,requestId);
      }
      const normalizedRules:Rec[]=[];
      const seenCodes=new Set<string>();
      for(const candidate of rules){
        if(typeof candidate!=="object"||candidate===null||Array.isArray(candidate))return response(req,err("VALIDATION_ERROR","Each tax rule must be an object.",requestId),400,requestId);
        const rule=candidate as Rec;
        const code=typeof rule.code==="string"?rule.code.trim():"";
        const label=typeof rule.label==="string"?rule.label.trim():"";
        const treatment=typeof rule.treatment==="string"?rule.treatment.trim():"";
        const rate=rule.rateBasisPoints;
        const priceIncludesTax=rule.priceIncludesTax;
        if(!/^[A-Z0-9_-]{2,40}$/.test(code)||seenCodes.has(code)||label.length<2||label.length>120
          ||!["taxable","zero_rated","exempt","out_of_scope","requires_review"].includes(treatment)
          ||!Number.isSafeInteger(rate)||Number(rate)<0||Number(rate)>100000
          ||typeof priceIncludesTax!=="boolean"){
          return response(req,err("VALIDATION_ERROR","Each rule needs a unique code, label, explicit tax treatment, rate in basis points, and tax-inclusive flag.",requestId),400,requestId);
        }
        if(treatment!=="taxable"&&Number(rate)!==0)return response(req,err("VALIDATION_ERROR","Only rules explicitly classified as taxable may carry a non-zero rate; verify classifications with your tax adviser.",requestId),400,requestId);
        seenCodes.add(code);
        normalizedRules.push({code,label,treatment,rateBasisPoints:Number(rate),priceIncludesTax});
      }
      const {data:latest,error:latestError}=await admin.from("pos_fiscal_tax_policies").select("policy_version")
        .eq("tenant_id",context.tenantId).eq("branch_id",context.branchId).order("policy_version",{ascending:false}).limit(1).maybeSingle();
      if(latestError)throw latestError;
      const nextVersion=Number(latest?.policy_version??0)+1;
      const {data:created,error:createError}=await admin.from("pos_fiscal_tax_policies").insert({
        tenant_id:context.tenantId,branch_id:context.branchId,fiscal_profile_id:profile.id,
        policy_name:policyName,policy_version:nextVersion,status:"draft",
        effective_from:effectiveFrom||null,effective_until:effectiveUntil,currency_code:"PHP",
        rounding_mode:"nearest_centavo",rules:normalizedRules,review_reference:null,reviewed_by:null,reviewed_at:null,
        created_by:auth.user.id,updated_by:auth.user.id
      }).select("id,tenant_id,branch_id,fiscal_profile_id,policy_name,policy_version,status,effective_from,effective_until,currency_code,rounding_mode,rules,created_at,updated_at").single();
      if(createError){
        const code=(createError as unknown as Rec).code;
        if(code==="23505")return response(req,err("CONFLICT","Another tax policy was created concurrently. Reload and try again.",requestId),409,requestId);
        throw createError;
      }
      return response(req,{data:created,requestId},201,requestId);
    }
    if(isOrders){
      const filter=new URL(req.url).searchParams.get("filter")??"active";
      if(filter!=="active"&&filter!=="all")return response(req,err("VALIDATION_ERROR","Order filter must be active or all.",requestId),400,requestId);
      const {data:orderData,error:orderError}=await admin.rpc("list_staff_orders",{p_tenant_id:context.tenantId,p_filter:filter,p_limit:100});
      if(orderError){
        const code=(orderError as unknown as Rec).code;
        if(code==="42501")return response(req,err("FORBIDDEN","You do not have permission to view these orders.",requestId),403,requestId);
        if(code==="22023")return response(req,err("VALIDATION_ERROR","The order filter could not be accepted.",requestId),400,requestId);
        throw orderError;
      }
      const rows=typeof orderData==="object"&&orderData!==null&&!Array.isArray(orderData)?(orderData as Rec).orders:[];
      const orders=Array.isArray(rows)?rows.filter((order:unknown)=>typeof order==="object"&&order!==null&&(order as Rec).branch_id===context!.branchId):[];
      return response(req,{data:{orders,filter},requestId},200,requestId);
    }
    if(isOrderTransition){
      // Bind the requested order to the explicitly authorized branch before invoking
      // the SaaS transition RPC; a cashier may belong to multiple branches.
      const {data:targetOrder,error:targetOrderError}=await admin.from("customer_orders")
        .select("id").eq("tenant_id",context.tenantId).eq("branch_id",context.branchId)
        .eq("id",String(orderActionBody.orderId)).maybeSingle();
      if(targetOrderError)throw targetOrderError;
      if(!targetOrder)return response(req,err("NOT_FOUND","The order is unavailable in this branch.",requestId),404,requestId);
      const {data:transition,error:transitionError}=await admin.rpc("transition_staff_order",{
        p_tenant_id:context.tenantId,p_order_id:String(orderActionBody.orderId),p_action:String(orderActionBody.action)
      });
      if(transitionError){
        const code=(transitionError as unknown as Rec).code;
        if(code==="42501")return response(req,err("FORBIDDEN","You do not have permission to change this order.",requestId),403,requestId);
        if(code==="22023")return response(req,err("VALIDATION_ERROR","The order action could not be accepted.",requestId),400,requestId);
        if(code==="P0002")return response(req,err("NOT_FOUND","The order is unavailable or has changed.",requestId),404,requestId);
        throw transitionError;
      }
      return response(req,{data:transition,requestId},200,requestId);
    }
    if(isSalesHistory){
      const rawLimit=Number(new URL(req.url).searchParams.get("limit")??"50");
      const limit=Math.max(1,Math.min(100,Number.isFinite(rawLimit)?Math.trunc(rawLimit):50));
      const {data:sales,error:salesError}=await admin.from("pos_sales").select("id,sale_number,cashier_user_id,subtotal_centavos,total_centavos,payment_method,payment_status,cash_tendered_centavos,change_centavos,created_at").eq("tenant_id",context.tenantId).eq("branch_id",context.branchId).order("created_at",{ascending:false}).limit(limit);
      if(salesError)throw salesError;
      const saleIds=(sales??[]).map((sale:Rec)=>sale.id).filter((id):id is string=>typeof id==="string");
      let saleLines:Rec[]=[];
      if(saleIds.length){
        const {data:lines,error:linesError}=await admin.from("pos_sale_items").select("sale_id,line_number,item_name_snapshot,unit_price_centavos,quantity,line_total_centavos").eq("tenant_id",context.tenantId).in("sale_id",saleIds).order("line_number",{ascending:true});
        if(linesError)throw linesError;
        saleLines=(lines??[]) as Rec[];
      }
      const result=(sales??[]).map((sale:Rec)=>({...sale,items:saleLines.filter((line:Rec)=>line.sale_id===sale.id)}));
      return response(req,{data:result,requestId},200,requestId);
    }
    const {data:rows,error:menuError}=await admin.from("menu_items")
      .select("id,category_id,name,description,price_centavos,image_path,menu_categories!inner(id,name,is_published),branch_menu_items!inner(is_available,price_override_centavos,tenant_id,branch_id)")
      .eq("tenant_id",context.tenantId).eq("status","published").eq("menu_categories.is_published",true)
      .eq("branch_menu_items.tenant_id",context.tenantId).eq("branch_menu_items.branch_id",context.branchId)
      .eq("branch_menu_items.is_available",true).order("name",{ascending:true}).limit(200);
    if(menuError)throw menuError;
    const data=(rows??[]).map((item:Rec)=>{
      const cat=Array.isArray(item.menu_categories)?item.menu_categories[0] as Rec:item.menu_categories as Rec;
      const branchRows=Array.isArray(item.branch_menu_items)?item.branch_menu_items:[];
      const branch=branchRows[0] as Rec|undefined;
      const price=typeof branch?.price_override_centavos==="number"?branch.price_override_centavos:item.price_centavos;
      return {id:item.id,categoryId:item.category_id,categoryName:typeof cat?.name==="string"?cat.name:"",name:item.name,description:typeof item.description==="string"?item.description:"",imagePath:typeof item.image_path==="string"&&item.image_path.trim()?item.image_path.trim():null,unitPriceCentavos:price,available:true};
    }).filter((i:Rec)=>typeof i.id==="string"&&typeof i.categoryId==="string"&&typeof i.categoryName==="string"&&i.categoryName.length>0&&typeof i.name==="string"&&Number.isSafeInteger(i.unitPriceCentavos)&&Number(i.unitPriceCentavos)>=0);
    return response(req,{data,requestId},200,requestId);
  }catch(e){
    console.error(JSON.stringify({event:"pos_api_request_failed",requestId,errorType:e instanceof Error?e.name:"unknown_error"}));
    return response(req,err("INTERNAL_ERROR","The POS service could not complete the request.",requestId),500,requestId);
  }
});
