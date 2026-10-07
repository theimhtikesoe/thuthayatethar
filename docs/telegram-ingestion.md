# Telegram → သုတရိပ်သာ Ingestion Plan

## လက်ရှိ connection details

- **Bot:** [@ThuThaYateTharBot](https://t.me/ThuThaYateTharBot)
- **Source group:** [သုတရိပ်သာ group](https://t.me/+MliKH1H_FQNmMGQ9)
- **Production website:** `https://thuthayatethar.rz99systems.com/`
- **Bot token:** WebDev production project secret `TELEGRAM_BOT_TOKEN` အဖြစ် သိမ်းထားပြီး token တန်ဖိုးကို source code, log သို့မဟုတ် chat ထဲတွင် မထည့်ပါ။

## Telegram-side လိုအပ်ချက်

Bot ကို group ထဲသို့ အရင် add လုပ်ပြီး admin permission ပေးရမည်။ Bot က command မဟုတ်သော document/photo message များကိုပါ ဖတ်နိုင်ရန် BotFather ထဲတွင် `/setprivacy` → `Disable` လုပ်ရမည်။ ထို့နောက် group ထဲတွင် စမ်းသပ်စာအုပ်ဖိုင်တစ်ခု၊ မျက်နှာဖုံးပုံတစ်ပုံနှင့် title/author/category/rights caption တစ်ခု ပို့ရမည်။ Group ထဲတွင် ဖိုင်ရှိခြင်းတစ်ခုတည်းသည် ပြသခွင့်အတည်ပြုချက် မဟုတ်သောကြောင့် rights evidence မရှိသေးသည့်ဖိုင်များကို production catalog တွင် အလိုအလျောက် publish မလုပ်ရ။

## ရည်ရွယ်ချက်

နောက်အဆင့်တွင် သတ်မှတ်ထားသော Telegram group ထဲသို့ တင်လာသော စာအုပ်ဖိုင်များနှင့် ပုံများကို bot က ဖတ်ယူပြီး စာအုပ်အသစ်အဖြစ် catalog ထဲသို့ ထည့်ပေးမည်။ Website မှာ စာအုပ်မျက်နှာဖုံး၊ metadata၊ ပုံပါစာမျက်နှာများနှင့် တရားဝင်ခွင့်ပြုထားသော full text ကို read-only အဖြစ် ဖတ်ရှုနိုင်မည်။

## အကြံပြုထားသော flow

1. Telegram Bot ကို သတ်မှတ်ထားသော group/channel တွင်သာ admin အဖြစ် ထည့်မည်။ Bot သည် allowed `chat_id` များ၊ allowed file type များနှင့် uploader role ကို စစ်မည်။
2. Bot webhook သည် စာအုပ် metadata (title, author, category, rights status) နှင့် `file_id`/media group ကို ingestion API သို့ ပို့မည်။ Bot token ကို server-side secret အဖြစ်သာ သိမ်းမည်။
3. Ingestion worker သည် Telegram `getFile` ဖြင့် file ကို ဆွဲယူ၊ MIME/size/virus scan စစ်၊ မူရင်းဖိုင်ကို private object storage (Cloudflare R2 သို့မဟုတ် Manus File storage) ထဲ သိမ်းမည်။
4. PDF/EPUB/image bundle ကို parsing pipeline ဖြင့် `Book`, `BookPage`, `Asset`, `RightsRecord` အဖြစ် ခွဲမည်။ မျက်နှာဖုံးကို သီးခြား cover asset၊ စာမျက်နှာများကို image/text asset အဖြစ် သိမ်းမည်။ OCR သည် စာအုပ်ပိုင်ရှင်ခွင့်ပြုထားသော ဖိုင်များအတွက်သာ ပြုလုပ်မည်။
5. Admin review မပြီးမချင်း `draft` အဖြစ်ထားမည်။ Review အဆင့်တွင် မူပိုင်ခွင့်အခြေအနေ၊ စာရေးဆရာ၊ ခေါင်းစဉ်နှင့် စာအုပ်အပြည့်အစုံပြသခွင့်ကို အတည်ပြုမည်။ အတည်ပြုပြီးမှ catalog တွင် `published` ဖြစ်မည်။
6. Reader သည် raw Telegram URL သို့မဟုတ် permanent download link မပေးဘဲ page image/text ကို short-lived signed URL သို့မဟုတ် server-mediated response ဖြင့် ပြမည်။ UI-level copy/print blocking သည် security မဟုတ်သောကြောင့် production တွင် access control၊ rate limit နှင့် watermark တို့ ထပ်ထည့်မည်။

## အကြံပြု data model

- `Book`: title, slug, author, category, summary, coverAssetId, readingTime, rightsStatus, publicationStatus.
- `BookPage`: bookId, pageNumber, imageAssetId, textContent, altText.
- `Asset`: storageKey, mimeType, byteSize, checksum, sourceTelegramFileId, visibility.
- `RightsRecord`: sourceChatId, sourceMessageId, grantedBy, evidenceUrl, reviewedAt, expiresAt.
- `IngestionJob`: telegramUpdateId, status, error, retryCount, processedAt.

## လုံခြုံရေးနဲ့ မူပိုင်ခွင့် guardrails

Telegram group ထဲက ဖိုင်ရှိနေခြင်းတစ်ခုတည်းကို တရားဝင်ပြသခွင့်အဖြစ် မယူဆရ။ Rights record မရှိသော စာအုပ်ကို metadata/summary-only အဖြစ်သာ ထားမည်။ Bot ကို public groups အားလုံးတွင် အလိုအလျောက် မဖတ်စေဘဲ allowlist သတ်မှတ်မည်။ Webhook signature/secret path၊ idempotency key၊ file size limit၊ MIME validation၊ malware scanning နှင့် audit log လိုအပ်မည်။

## လက်ရှိအဆင့် — webhook receiver

- Production website တွင် `POST /api/telegram/webhook` ကို server-side receiver အဖြစ် အသုံးပြုမည်။ Route သည် Telegram `X-Telegram-Bot-Api-Secret-Token` header ကို `TELEGRAM_WEBHOOK_SECRET` နှင့် constant-time comparison လုပ်ပြီး၊ `TELEGRAM_ALLOWED_CHAT_ID` ဖြင့် သတ်မှတ်ထားသော `group`/`supergroup` chat එකээс ирсэн `message`/`edited_message` ထဲက PDF document သို့မဟုတ် photo media ကိုသာ `accepted` ဟုတုံ့ပြန်မည်။
- Request JSON ကို 256 KiB အထိကန့်သတ်သည်။ မမှန်သော secret ကို `401`, မမှန်သော JSON ကို `400`, oversized body ကို `413`, environment configuration မပြည့်စုံလျှင် `503` ဖြင့် တုံ့ပြန်သည်။ Chat, media, update အမျိုးအစား မကိုက်ညီပါက Telegram retry မဖြစ်စေရန် `200 ignored` ပြန်ပေးသည်။
- Receiver သည် `update_id` နှင့် media type ကိုသာ လျှော့ချမှတ်တမ်းတင်သည်။ Caption, user details, chat ID, file ID နှင့် raw update ကို မ log လုပ်ပါ။ ဤအဆင့်တွင် Telegram ဖိုင်ကို download မလုပ်၊ OCR မလုပ်၊ database/object storage တွင် မသိမ်း၊ catalog မပြင်ဆင်/မထုတ်ဝေပါ။ ထို့ကြောင့် 200 `accepted` သည် media update ရောက်ရှိပြီး filter ကိုကျော်ခဲ့သည်ဟုသာ ဆိုလိုပြီး durable ingestion သို့မဟုတ် processing ပြီးစီးသည်ဟု မဆိုလိုပါ။
- Production runtime တွင် `TELEGRAM_WEBHOOK_SECRET` နှင့် group ရဲ့ numeric `TELEGRAM_ALLOWED_CHAT_ID` ကို protected environment settings အဖြစ်ထားရမည်။ လက်ရှိသိမ်းထားပြီးသား `TELEGRAM_BOT_TOKEN` ကို source ထဲမထည့်ဘဲ Telegram Bot API ၏ `setWebhook` အတွက်သာ operator ကအသုံးပြုရမည်။ `allowed_updates` ကို `message` နှင့် `edited_message` သာထားရမည်။

## နောက်တစ်ဆင့် — full ingestion pipeline

Webhook လက်ခံမှုတည်ငြိမ်ပြီးနောက် persistent queue/idempotency၊ Telegram `getFile`၊ MIME နှင့် byte-size စစ်ဆေးခြင်း၊ malware scan၊ private object storage၊ database schemas၊ OCR၊ rights review/admin screen болон approval ပြီးမှ catalog publish လုပ်ခြင်းကို သီးခြားတည်ဆောက်မည်။ Group ထဲဖိုင်တင်ထားခြင်းတစ်ခုတည်းကို publication permission အဖြစ် ဘယ်တော့မှ မယူဆရ။
