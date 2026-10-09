# Telegram → သုတရိပ်သာ Ingestion Plan

## လက်ရှိ source နှင့် connection

- **Bot:** [@ThuThaYateTharBot](https://t.me/ThuThaYateTharBot)
- **Upload group:** [သုတရိပ်သာ group](https://t.me/+MliKH1H_FQNmMGQ9) — လက်ရှိသတ်မှတ်ထားသော တစ်ခုတည်းသော file intake source ဖြစ်သည်။
- **Website:** `https://thuthayatethar.rz99systems.com/`
- **Bot token:** `TELEGRAM_BOT_TOKEN` ကို WebDev production secret အဖြစ်သာထားပါ; source code, log, chat ထဲမထည့်ပါနှင့်။ လက်ရှိ receiver တွင် token ကိုအသုံးမပြုပါ။ Webhook မှတ်ပုံတင်ရန်နှင့် နောက်ဆင့် worker က Telegram `getFile` ဖြင့် file ရယူရန် server-side မှ အသုံးပြုရမည်။
- [@sarpaymyr](https://t.me/sarpaymyr) နှင့် [@RO_Bookshelf](https://t.me/RO_Bookshelf) တို့သည် ယခု workflow ၏ source မဟုတ်ပါ။ Bot သည် ၎င်းတို့ထံမှ file မယူရ။

## Group `chat_id` နှင့် Telegram setup

Bot ကို group ထဲထည့်ပြီး test message သို့မဟုတ် document တစ်ခု ပို့ပါ။ Webhook မသတ်မှတ်ထားသေးလျှင် Bot API `getUpdates` response ထဲက `message.chat.id` သည် group ၏ numeric ID ဖြစ်သည်။ Webhook သတ်မှတ်ထားပါက `getUpdates` အသုံးမပြုနိုင်ပါ; `getWebhookInfo` ဖြင့်အခြေအနေကိုစစ်ပြီး လိုအပ်လျှင် webhook update မှ chat ID ကို လုံခြုံစွာရယူပါ။ Bot က group ထဲရှိ non-command message များကို လက်ခံနိုင်ရန် BotFather `/setprivacy` ကို `Disable` လုပ်ပါ သို့မဟုတ် bot ကို group admin အဖြစ်သတ်မှတ်ပါ။ `setWebhook.allowed_updates` တွင် `message` နှင့် `edited_message` ကိုသာ ထည့်ပါ။ Production `TELEGRAM_ALLOWED_CHAT_IDS` တွင် ကိုယ်ပိုင် upload group ၏ numeric ID ကိုသာ သတ်မှတ်ပါ။ Bot မထည့်မီက group history ကို webhook က ပြန်မယူနိုင်ပါ။

## Upload → scan → draft → publish လမ်းကြောင်း

1. Webhook သည် group allowlist, secret-token header နှင့် Telegram JSON update ကိုစစ်ပြီး document/photo သို့မဟုတ် HTTPS SoundCloud link (`soundcloud.com` subdomain အပါအဝင်) ကို candidate အဖြစ် D1 intake ထဲသိမ်းပြီးမှ acknowledge လုပ်မည်။ SoundCloud link ၏ tracking parameters များကို ဖယ်ရှားကာ canonical URL ကို သီးခြား intake item အဖြစ်ထားမည်။ SoundCloud audio ကို အလိုအလျောက် download သို့မဟုတ် publish မလုပ်ပါ။
2. နောက်ဆင့် worker သည် Telegram `getFile` ဖြင့် file ကိုရယူပြီး extension/MIME, actual file type, byte size, checksum နှင့် malware ကိုစစ်ဆေးမည်။ မသိသော format၊ size limit ကျော်သော file သို့မဟုတ် validation မအောင်မြင်သော file ကို quarantine ထဲထားမည်။
3. Validation ပြီးပြီး rights evidence ရရှိမှသာ text extraction/OCR လုပ်ကာ title, author, category, summary နှင့် page data ကို draft အဖြစ်ဖန်တီးမည်။ မြန်မာစာ OCR ရလဒ်ကို လူကပြန်စစ်နိုင်သည့်အဆင့် ပါရမည်။
4. File တစ်ခုချင်းစီအတွက် rights status/evidence ကို `RightsRecord` ထဲသိမ်းပြီး admin review ပြီးမှ catalog တွင် publish လုပ်မည်။ Group ထဲ file တင်ထားခြင်း၊ bot ကို admin လုပ်ထားခြင်း သို့မဟုတ် credit ပေးထားခြင်းတစ်ခုတည်းကို publication approval အဖြစ် အလိုအလျောက် မသတ်မှတ်ရ။
5. Approved assets များကို private object storage/server-mediated reader ဖြင့်သာပေးမည်။ Telegram raw/permanent file URL များကို public မလုပ်ရ။ `IngestionJob` ကို `telegramUpdateId` ဖြင့် idempotent လုပ်ပြီး retry များကြောင့် catalog item ထပ်မတင်စေရ။

## လက်ရှိ webhook code ၏ scope

Durable intake worker သည် Telegram `X-Telegram-Bot-Api-Secret-Token` header နှင့် group allowlist ကိုစစ်သည်။ Configured group/supergroup မှ document/photo သို့မဟုတ် HTTPS SoundCloud link candidate များကို D1 တွင် persist လုပ်ပြီးမှ `accepted` ပြန်ပေးသည်။ SoundCloud URL များကို tracking query/fragment မပါသည့် canonical URL အဖြစ် သိမ်းသည်; SoundCloud အသံကို အလိုအလျောက်ရယူခြင်း သို့မဟုတ် publish လုပ်ခြင်း မရှိပါ။ Request JSON ကို 256 KiB အထိကန့်သတ်ပြီး log ထဲ raw update သို့မဟုတ် link ကို မရေးပါ။ `accepted` သည် durable intake ထဲရောက်သည်ကိုသာဆိုလိုပြီး media download, scan/OCR သို့မဟုတ် website ပေါ် publish ပြီးစီးသည်ဟု မဆိုလိုပါ။

## ဒေတာဖွဲ့စည်းပုံနှင့် အခွင့်အရေးမှတ်တမ်း

`Book`: title, slug, author, category, summary, coverAssetId, readingTime, rightsStatus, publicationStatus. `BookPage`: pageNumber, imageAssetId, textContent. `Asset`: storageKey, MIME, byteSize, checksum, Telegram file reference, visibility. `RightsRecord`: source chat/message, rights holder, evidence, reviewer, reviewedAt, allowed uses, expiry. `IngestionJob`: Telegram update ID, status, error, retry count. Bot token နှင့် API secret များကို ဤ record များတွင် မသိမ်းရ။

Telegram Bot API reference: https://core.telegram.org/bots/api

## Hosting note

၂၀၂၆-၁၀-၀၇ ရက်တွင် `https://thuthayatethar.rz99systems.com/` ကို စစ်ဆေးရာ response header များတွင် `x-manus-proxy-mode: transparent/1`, `x-thuthayatethar-proxy: cloudflare-worker`, `server: cloudflare`, `x-powered-by: Next.js` ပါဝင်သည်။ ယင်းအချက်များက လက်ရှိ site ကို Manus gateway နှင့် Cloudflare Worker မှတစ်ဆင့် ပေးနေကြောင်းပြသည်; Vercel deployment ဖြစ်ကြောင်း မပြပါ။ Hosting ကို Vercel သို့ ပြောင်းရန် သီးခြားမဆုံးဖြတ်သေးပါက environment variable များကို existing Manus WebDev production project ထဲတွင်သာ ထည့်ပါ။ Source: https://thuthayatethar.rz99systems.com/
