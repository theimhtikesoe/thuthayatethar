# Telegram → သုတရိပ်သာ Ingestion

## လက်ရှိ production topology

- **Bot:** [@ThuThaYateTharBot](https://t.me/ThuThaYateTharBot)
- **Upload group:** [သုတရိပ်သာ group](https://t.me/+MliKH1H_FQNmMGQ9) — သတ်မှတ်ထားသော file intake source ဖြစ်သည်။
- **Website:** `https://thuthayatethar.rz99systems.com/` — Vercel project `thuthayatethar` ပေါ်တွင်ရှိသည်။ Cloudflare DNS သည် Vercel IP `76.76.21.21` သို့ unproxied A record ဖြင့်ညွှန်ထားပြီး website အတွက် Worker route မရှိပါ။ Legacy proxy Worker သည် live site လမ်းကြောင်းတွင် မပါဝင်ပါ။
- **Ingestion API:** `https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev` — Cloudflare Worker ဖြစ်ပြီး D1 `thuthayatethar-ingestion` နှင့် private R2 `thuthayatethar-private-ingestion` ကို အသုံးပြုသည်။ Site catalog နှင့် Worker catalog သည် စစ်ဆေးချိန်တွင် 75 records တူညီခဲ့သည်။
- **Secrets:** Bot token နှင့် webhook secret ကို Cloudflare Worker Secret Store binding များတွင်ထားသည်။ Admin token နှင့် relay Access credentials များကိုလည်း secret binding များဖြင့်သာထားပါ။ တန်ဖိုးကို source, log သို့မဟုတ် chat ထဲမထည့်ပါနှင့်။
- `@sarpaymyr` နှင့် `@RO_Bookshelf` တို့သည် ယခု workflow ၏ source မဟုတ်ပါ။ Bot သည် ၎င်းတို့ထံမှ file မယူရ။

## Telegram SoundCloud links → audiobook tab

- Allowlisted upload group ထဲသို့ SoundCloud track URL တစ်ခု ပို့လိုက်လျှင် Worker က `soundcloud_link` intake/draft အဖြစ် D1 တွင်သိမ်းပြီး public catalog က ထို link ကို ထုတ်ပေးသည်။ Website ရှိ **အသံစာအုပ်** top-menu tab တွင် ပေါ်လာမည်ဖြစ်ပြီး ဖွင့်ထားသော page ကို အများဆုံး 30 စက္ကန့်အတွင်း အလိုအလျောက် refresh လုပ်သည်။
- ဒီစီးဆင်းမှုသည် PDF auto-publish မဟုတ်ပါ။ Audio file ကို မဒေါင်းလုဒ်/မကူးယူပါ၊ SoundCloud URL ကိုသာ ပြသပြီး SoundCloud player မှတစ်ဆင့် ဖွင့်သည်။ Telegram မှရောက်လာသည့်အရာဟု card တွင် label ပြထားသည်။ SoundCloud link သည် public/ဖွင့်နိုင်သော track ဖြစ်ကြောင်းနှင့် တင်ပြခွင့်ရှိကြောင်းကို သီးခြားစစ်ဆေးရမည်; catalog တွင်ပေါ်ခြင်းသည် rights approval ဖြစ်သည်ဟု မယူဆရ။
- မသက်ဆိုင်သော URL host များကို link intake အဖြစ်လက်မခံပါ။ SoundCloud link မဟုတ်သည့် PDF draft များ (direct upload နှင့် auto-publish မစတင်မီ ရောက်ခဲ့သည်များ အပါအဝင်)၊ Wattpad link card များနှင့် အခြား unreviewed draft များသည် public catalog ထဲ မပါဝင်ပါ။ (ဓာတ်ပုံတစ်ပုံတည်းကို intake မလုပ်ပါ။)

## Intake → automatic public PDF publication

1. Telegram Worker `POST /telegram/webhook` သည် configured secret-token header နှင့် allowlisted upload group ကိုစစ်ပြီး intake metadata/event ကို D1 တွင် မှတ်တမ်းတင်သည်။ `accepted` ဆိုသည်မှာ file storage ပြီးစီးကြောင်း မဆိုလိုပါ။
2. PDF အလုပ်များသည် D1 queue state ကို အသုံးပြုသည်။ Worker Cron သည် တစ်မိနစ်လျှင် pending intake တစ်ခုကိုရွေးကာ conditional update ဖြင့် `downloading` ဟု claim လုပ်ပြီး တစ်ကြိမ်တွင် ဖိုင်တစ်ခုသာ ဆောင်ရွက်သည်။ `downloading` အခြေအနေ 20 မိနစ်ကျော် အဟောင်းဖြစ်နေပါက ပြန်လည်စမ်းသပ်ရန် အကျုံးဝင်သည်။ Long transfer ကို HTTP response ပြီးနောက် 30 စက္ကန့်သာအသက်ရှင်သော `ctx.waitUntil()` ထဲတွင် မထားရ။
3. Worker သည် Telegram file ကို configured API/Access relay မှရယူပြီး PDF type/header နှင့် configured size limit ကိုစစ်ဆေးသည်။ 20 MB ထက်ကြီးသော file များအတွက် Local Bot API relay ကိုအသုံးပြုသည်။ R2 streaming တွင် native `FixedLengthStream.readable` ကို တိုက်ရိုက်အသုံးပြုရမည်။
4. Telegram group ထဲက PDF ကို အပြည့်အစုံ ဒေါင်းလုဒ်လုပ်ပြီး validation ကျော်ကာ private R2 ထဲ အောင်မြင်စွာ သိမ်းပြီးမှသာ D1 `intake_items` နှင့် `book_drafts` ကို `published` အဖြစ် ပြောင်းသည်။ Publication နှင့် storage event တို့ကို D1 batch တစ်ခုတည်းဖြင့် ရေးသည်။ Public သို့ ဝန်ဆောင်သည်မှာ Telegram file URL မဟုတ်ဘဲ published Worker route များဖြစ်ပြီး cover object သည် private R2 ထဲမှာပင် ကျန်သည်။
5. Auto-publish ကို repository ပိုင်ရှင်၏ ဆုံးဖြတ်ချက်အရ ဆက်လက်ထားရှိသည် (2026-10-10)။ ဤ PDF များကို မူပိုင်ခွင့် လူကိုယ်တိုင် **မစစ်ဆေးပါ**။ RightsRecord သည် `missing` ကျန်ပြီး `evidence_note = 'auto_publish_unreviewed'` ဟု မှတ်သည်။ ဒါသည် OCR၊ malware scan သို့မဟုတ် copyright clearance မဟုတ်ပါ၊ ထို့ကြောင့် ခွင့်ပြုထားသော ဖိုင်များကိုသာ group သို့ ပို့ပါ။ ဤစည်းမျဉ်းသည် Telegram group ၏ document PDF များအတွက်သာဖြစ်ပြီး Worker var `AUTO_PUBLISH_FROM` အချိန်နောက်ပိုင်း ရောက်ခဲ့သည်များကိုသာ publish လုပ်သည်၊ ယင်းမတိုင်မီ ရောက်ခဲ့သော intake များကို ပြန်လည် publish မလုပ်ပါ။ Wattpad link၊ ဓာတ်ပုံနှင့် direct admin upload တို့သည် ဤစည်းမျဉ်းဖြင့် publish မဖြစ်ပါ။ Admin က နောက်မှ `/admin` ၏ “Rights အတည်ပြုမည်” ဖြင့် rights ကို `approved` သို့ ပြောင်းနိုင်ပြီး publication status ကို မပြောင်းပါ။
6. `MAX_FILE_BYTES` ထက်ကျော်သော ဖိုင်၊ ဒေါင်းလုဒ်/validation/R2 သိမ်းဆည်းမှု မအောင်မြင်သော ဖိုင်များသည် public မဖြစ်ပါ။ `failed` အဖြစ် ကျန်ပြီး admin retry လိုအပ်သည်။ Example/default limit သည် 160 MiB ဖြစ်ပြီး အကန့်အသတ်မရှိဟု မဆိုလိုပါ။
7. Worker structured logs: `telegram_file_received`, `queue_candidate_found`, `queue_claimed`, `file_processing_started`, `telegram_pdf_published`, `file_processing_failed`, `cron_tick_started`/`cron_tick_finished`။ Log ထဲတွင် token၊ Telegram file ID သို့မဟုတ် filename မရေးပါ။

## Telegram message တစ်ခုကို ဘယ်လိုခွဲခြားသလဲ

- **PDF ပါလျှင် PDF ကိုသာ သိမ်းသည်။** Caption ထဲက Wattpad link ကို မသိမ်းပါ။ Caption ထဲက SoundCloud link ကိုတော့ ထို PDF ၏ `source_url` အဖြစ် ထိန်းထားပြီး စာအုပ်ကတ်၏ `soundcloud_url` ဖြစ်လာသည်။
- **ဓာတ်ပုံတစ်ပုံတည်းကို လက်မခံပါ။** Intake၊ draft၊ R2 object ဘာမှ မဖန်တီးပါ (`status: ignored`)။ ဓာတ်ပုံ caption ထဲ SoundCloud/Wattpad link ပါလျှင် link ကိုသာ intake လုပ်ပြီး ဓာတ်ပုံကို မသိမ်းပါ။
- **Link တစ်ခုချင်းစီသည် intake တစ်ခုစီဖြစ်သည်။** Message တစ်ခုထဲ SoundCloud track link များစွာပါလျှင် (ထပ်နေသည်များဖယ်၊ အများဆုံး 10 ခု) တစ်ခုချင်းစီကို `soundcloud_link` draft အဖြစ် သိမ်းသည်။ Link တစ်ခုချင်းစီအတွက် URL မှ ထုတ်သော synthetic `telegram_update_id` ကို သုံးသဖြင့် Update တစ်ခုတည်းမှ link များစွာ ဝင်လာလည်း UNIQUE conflict မဖြစ်ပါ။ Wattpad link နှင့် SoundCloud link တစ်ပြိုင်တည်းပါလျှင် သီးခြား intake နှစ်ခုဖြစ်သည်။
- **SoundCloud channel/profile URL** (`/user`၊ `/user/tracks`၊ `/user/popular-tracks`) ကို message ထဲ တစ်ခုတည်းပို့မှသာ track များအဖြစ် ခွဲထုတ်သည်။ အခြား link များနှင့် ရောပို့လျှင် ကျော်ပြီး webhook response ၏ `skippedChannelUrls` နှင့် Worker log တွင်သာ မှတ်သည်။
- Webhook response သည် link တစ်ခုတည်းဆိုလျှင် `{ status, intakeId, sourceType }` ပုံစံအတိုင်းဖြစ်ပြီး link များစွာဆိုလျှင် `sourceType: "links"`၊ `count`၊ `created`၊ `duplicates`၊ `intakeIds` ပါသည်။ Update တစ်ခုကို ထပ်ပို့လျှင် (Telegram retry) link key ဖြင့် `duplicate` ပြန်ပြီး ပျက်နေသော rights/draft/event rows ကိုလည်း ပြန်ဖြည့်ပေးသည်။


## SoundCloud channel links

- When an allowed Telegram group sends a public SoundCloud profile URL, `/tracks` URL or `/popular-tracks` URL, the Worker fetches the page and creates one `intake_items` row, `book_drafts` row and pending `rights_records` row for each discovered track (maximum 50 per message). Track title, uploader label and canonical permalink are saved. Repeated imports deduplicate by the SoundCloud permalink, including a track that was previously submitted directly.
- These records are created with `publication_status='draft'`, but the public catalog includes them anyway (unless an admin sets them to `unpublished`). Appearing in the catalog does not mean rights were reviewed or approved. A successful webhook response reports the number created and the number already present. Fetch failures, empty pages and unsupported HTML return an error response and are logged; check Worker logs before retrying the message.
- The page fetch is limited to 8 seconds and 1 MiB and will not follow a redirect away from HTTPS SoundCloud. This is a public-page HTML extractor, not the SoundCloud API; markup changes can break extraction. The official API is a more durable option but requires SoundCloud OAuth application credentials.
- Playlist URLs such as `/user/sets/playlist-name` are not expanded in this version. They continue through the existing single-link draft flow, so they should be reviewed as one embedded playlist. For a future playlist importer, decide whether to preserve the set as one player item or split it into ordered track drafts with a stored playlist relationship.

## Admin recovery

- Authenticated admin interface: `https://thuthayatethar.rz99systems.com/admin`.
- Failed PDF အတွက် admin retry သည် status ကို `failed` မှ `received` သို့ပြောင်းပြီး retry event မှတ်တမ်းတင်သည်။ Endpoint သည် queued အဖြစ် လက်ခံကြောင်း `202` ပြန်ပေးသည်; Cron က နောက်တစ်ကြိမ် run သည့်အခါ လုပ်ဆောင်မည်။ Admin UI သည် `received`/`downloading` အခြေအနေကိုစောင့်ကြည့်ပြီး အောင်မြင်မှသာ ပြရမည် — `AUTO_PUBLISH_FROM` နောက်ပိုင်းဖိုင်ဆိုလျှင် `published`၊ ယင်းမတိုင်မီဖိုင်ဆိုလျှင် private `draft`။
- Retry ကိုယ်တိုင်က rights မ approve ပါ။ Retry အောင်မြင်လျှင် publish ဖြစ်/မဖြစ်ကို အဆင့် 5 (`AUTO_PUBLISH_FROM`) အတိုင်း ဆုံးဖြတ်သည်။ အမှားဖြစ်ပါက intake သည် `failed` ဖြစ်ပြီး error ကို admin တွင်ပြရမည်။
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
