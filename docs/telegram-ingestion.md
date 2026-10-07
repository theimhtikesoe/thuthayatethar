# Telegram → သုတရိပ်သာ Ingestion Plan

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

## နောက်တစ်ဆင့် implementation

Production domain publish ပြီးနောက် server/API layer ကို သတ်မှတ်ပြီး Telegram Bot API credential ကို secret manager ထဲသို့ ထည့်မည်။ ထို့နောက် Database schema နှင့် storage bucket တည်ဆောက်၊ admin review screen နှင့် first ingestion test group တစ်ခုဖြင့် စမ်းသပ်မည်။
