# Telegram → သုတရိပ်သာ Ingestion

## လက်ရှိ production topology

- **Bot:** [@ThuThaYateTharBot](https://t.me/ThuThaYateTharBot)
- **Upload group:** [သုတရိပ်သာ group](https://t.me/+MliKH1H_FQNmMGQ9) — သတ်မှတ်ထားသော file intake source ဖြစ်သည်။
- **Website:** `https://thuthayatethar.rz99systems.com/` — Vercel project `thuthayatethar` ပေါ်တွင်ရှိသည်။ Cloudflare DNS သည် Vercel IP `76.76.21.21` သို့ unproxied A record ဖြင့်ညွှန်ထားပြီး website အတွက် Worker route မရှိပါ။ Legacy proxy Worker သည် live site လမ်းကြောင်းတွင် မပါဝင်ပါ။
- **Ingestion API:** `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev` — Cloudflare Worker ဖြစ်ပြီး D1 `thuthayatethar-ingestion` နှင့် private R2 `thuthayatethar-private-ingestion` ကို အသုံးပြုသည်။ Site catalog နှင့် Worker catalog သည် စစ်ဆေးချိန်တွင် 75 records တူညီခဲ့သည်။
- **Secrets:** Bot token နှင့် webhook secret ကို Cloudflare Worker Secret Store binding များတွင်ထားသည်။ Admin token နှင့် relay Access credentials များကိုလည်း secret binding များဖြင့်သာထားပါ။ တန်ဖိုးကို source, log သို့မဟုတ် chat ထဲမထည့်ပါနှင့်။
- `@sarpaymyr` နှင့် `@RO_Bookshelf` တို့သည် ယခု workflow ၏ source မဟုတ်ပါ။ Bot သည် ၎င်းတို့ထံမှ file မယူရ။

## Intake → private draft → human review

1. Telegram Worker `POST /telegram/webhook` သည် configured secret-token header နှင့် allowlisted upload group ကိုစစ်ပြီး intake metadata/event ကို D1 တွင် မှတ်တမ်းတင်သည်။ `accepted` ဆိုသည်မှာ file storage ပြီးစီးကြောင်း မဆိုလိုပါ။
2. PDF အလုပ်များသည် D1 queue state ကို အသုံးပြုသည်။ Worker Cron သည် တစ်မိနစ်လျှင် pending intake တစ်ခုကိုရွေးကာ conditional update ဖြင့် `downloading` ဟု claim လုပ်ပြီး တစ်ကြိမ်တွင် ဖိုင်တစ်ခုသာ ဆောင်ရွက်သည်။ `downloading` အခြေအနေ 20 မိနစ်ကျော် အဟောင်းဖြစ်နေပါက ပြန်လည်စမ်းသပ်ရန် အကျုံးဝင်သည်။ Long transfer ကို HTTP response ပြီးနောက် 30 စက္ကန့်သာအသက်ရှင်သော `ctx.waitUntil()` ထဲတွင် မထားရ။
3. Worker သည် Telegram file ကို configured API/Access relay မှရယူပြီး PDF type/header နှင့် configured size limit ကိုစစ်ဆေးသည်။ 20 MB ထက်ကြီးသော file များအတွက် Local Bot API relay ကိုအသုံးပြုသည်။ R2 streaming တွင် native `FixedLengthStream.readable` ကို တိုက်ရိုက်အသုံးပြုရမည်။
4. File အောင်မြင်စွာရရှိပါက private R2 bucket တွင်သိမ်းပြီး D1 မှတ်တမ်းနှင့် private book draft ဖန်တီးသည်။ Telegram file URL ကို public မလုပ်ပါ။ လက်ရှိ flow သည် OCR သို့မဟုတ် malware verdict ကို အလိုအလျောက်မလုပ်သေးသောကြောင့် metadata၊ content quality နှင့် အခွင့်အရေးအထောက်အထားများကို လူက review လုပ်ရန်လိုသည်။
5. RightsRecord ထဲရှိ အခွင့်အရေးပိုင်ရှင်၊ evidence နှင့် ခွင့်ပြုထားသည့်အသုံးပြုမှုကို လူကစစ်ဆေးပြီး admin မှ သီးခြား approve လုပ်ပြီးမှ publish လုပ်ရမည်။ Group ထဲ file တင်ထားခြင်း၊ bot ကို admin လုပ်ထားခြင်း သို့မဟုတ် credit ပေးထားခြင်းတစ်ခုတည်းကို publication approval အဖြစ် အလိုအလျောက်မသတ်မှတ်ရ။

## Admin recovery

- Authenticated admin interface: `https://thuthayatethar.rz99systems.com/admin`.
- Failed PDF အတွက် admin retry သည် status ကို `failed` မှ `received` သို့ပြောင်းပြီး retry event မှတ်တမ်းတင်သည်။ Endpoint သည် queued အဖြစ် လက်ခံကြောင်း `202` ပြန်ပေးသည်; Cron က နောက်တစ်ကြိမ် run သည့်အခါ လုပ်ဆောင်မည်။ Admin UI သည် `received`/`downloading` အခြေအနေကိုစောင့်ကြည့်ပြီး အောင်မြင်မှသာ private draft အဖြစ်သိမ်းပြီးကြောင်း ပြရမည်။
- Retry သည် rights approve သို့မဟုတ် publish မလုပ်ပါ။ အမှားဖြစ်ပါက intake သည် `failed` ဖြစ်ပြီး error ကို admin တွင်ပြရမည်။
- Storage အောင်မြင်မှုကို D1 `status`, `storage_key`, `byte_size` နှင့် event metadata ဖြင့်သာစစ်ဆေးပါ; PDF content ကို diagnostic အတွက်မဖတ်ပါနှင့်။

## Large-file handling

2026-10-09 တွင် 135 MB ဝန်းကျင် PDF တစ်ခုသည် D1 intake သို့ရောက်ခဲ့သော်လည်း R2 upload တွင် `Provided readable stream must have a known length` ဖြင့် fail ဖြစ်ခဲ့သည်။ `FixedLengthStream` ကို `pipeThrough()` ဖြင့် wrap လုပ်ရာ native known-length marker ပျောက်ခဲ့ခြင်းဖြစ်သည်။ ပြုပြင်ထားသောပုံစံမှာ `new FixedLengthStream(size)` မှရသော `readable` half ကို `R2Bucket.put` ထဲ တိုက်ရိုက်ပေးပြီး incoming stream ကို `writable` half ထဲ pipe လုပ်ခြင်းဖြစ်သည်။

D1 queue/Cron သည် Worker response ပြန်ပြီးနောက် 30-second `waitUntil` အချိန်ကန့်သတ်ချက်ထက်ကျော်လွန်နိုင်သော transfer များကို ဆက်လက်ဆောင်ရွက်စေရန် သုံးသည်။ Cron trigger ပြောင်းလဲမှုသည် network တစ်လျှောက် ပြန့်နှံ့ရန် 15 မိနစ်အထိကြာနိုင်သည်။

## Routing and configuration notes

- Current production intake receiver: `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/telegram/webhook`.
- Vercel `POST /api/telegram/webhook` route သည် legacy route ဖြစ်ပြီး active Telegram receiver အဖြစ် မသုံးရ; live intake Worker ကိုသာသုံးပါ။
- ဤ repair တွင် `setWebhook` မခေါ်ထားပါ။ D1 intake သည် Telegram PDF တစ်ခု Worker pipeline သို့ရောက်ခဲ့ကြောင်းပြသသော်လည်း Bot API ၏ လက်ရှိ `getWebhookInfo` ကို မစစ်ထားပါ။ ထို့ကြောင့် နောက်တစ်ကြိမ် webhook ပြောင်းလဲမှုမလုပ်မီ လုံခြုံစွာအတည်ပြုပါ။ `drop_pending_updates=true` ကို မသုံးပါနှင့်။
- Cloudflare script-content API သည် Worker code သာပြောင်းပြီး config/metadata/bindings မထိပါ။ Cron schedules ကို Worker's dedicated schedules API မှ သီးခြားစီမံပါ။ D1/R2 binding, DNS, webhook URL နှင့် secret value များကို သီးခြားအကြောင်းပြချက်မရှိဘဲ မပြောင်းပါနှင့်။

Telegram Bot API reference: https://core.telegram.org/bots/api
Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
Cloudflare waitUntil: https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil
Cloudflare FixedLengthStream: https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/
Cloudflare R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
