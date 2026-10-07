# Telegram → သုတရိပ်သာ Ingestion Plan

## လက်ရှိ connection details

- **Bot:** [@ThuThaYateTharBot](https://t.me/ThuThaYateTharBot)
- **Review/test group:** [သုတရိပ်သာ group](https://t.me/+MliKH1H_FQNmMGQ9)
- **Potential source channels:** [@sarpaymyr](https://t.me/sarpaymyr), [@RO_Bookshelf](https://t.me/RO_Bookshelf)
- **Production website:** `https://thuthayatethar.rz99systems.com/`
- **Bot token:** WebDev production project secret `TELEGRAM_BOT_TOKEN` အဖြစ်သာသိမ်းပြီး source code, log သို့မဟုတ် chat ထဲသို့ မထည့်ရ။

## Numeric `chat_id` ရယူနည်း

- Public channel အတွက် Telegram Bot API `getChat` ကို `chat_id=@sarpaymyr` ဖြင့် bot token ကိုသိမ်းထားသော protected environment မှခေါ်ပြီး response ထဲက `result.id` ကိုယူနိုင်သည်။ Bot token ကို browser address bar, chat, commit သို့မဟုတ် terminal command history ထဲ မထည့်ပါနှင့်။
- Group အတွက် bot ကို group ထဲသို့ ထည့်ပြီး test message တစ်ခု ပို့ပါ။ Webhook မတပ်ထားချိန် Telegram Bot API `getUpdates` response ထဲရှိ `message.chat.id` သည် numeric ID ဖြစ်သည်။ Webhook တပ်ထားပါက `getUpdates` အလုပ်မလုပ်သောကြောင့် `getWebhookInfo` ဖြင့်အခြေအနေကိုစစ်ပြီး webhook payload ကို server-side မှ စစ်ရမည်။
- Group/channel ID များကို protected environment setting `TELEGRAM_ALLOWED_CHAT_IDS` တွင် comma-separated အဖြစ်ထည့်နိုင်သည်။ Channel ID များသည် အများအားဖြင့် `-100...` ပုံစံဖြစ်သော်လည်း API response ထဲက numeric value ကိုသာ ယုံကြည်ပါ။

## Telegram-side လိုအပ်ချက်

Bot ကို group ထဲထည့်ရမည်။ Public channel `@sarpaymyr` မှ **အသစ်တင်မည့်** post update များရယူရန် channel admin က bot ကို administrator အဖြစ်ထည့်ရမည်။ BotFather `/setprivacy` → `Disable` သည် group ထဲက non-command message များအတွက်သာဖြစ်ပြီး channel admin permission ကို အစားမထိုးပါ။ Webhook `allowed_updates` တွင် `message`, `edited_message`, `channel_post`, `edited_channel_post` ပါရမည်။ Telegram Bot API webhook သည် webhook တပ်ပြီးနောက် ဖြစ်လာသော update များကိုပို့ပြီး အရင်တင်ထားသည့် channel history ကို backfill မလုပ်ပါ။

## Source channel နှင့် မူပိုင်ခွင့်

`@sarpaymyr` public preview တွင် copyright concern ရှိပါက ဆက်သွယ်ရန်နှင့် original owner များကို credit ပေးကြောင်းသာဖော်ပြထားပြီး ပြန်လည်ကူးယူ/ထုတ်ဝေခွင့်လိုင်စင် မဖော်ပြထားပါ။ Public channel ဖြစ်ခြင်း၊ credit ပေးထားခြင်း သို့မဟုတ် bot ကို admin လုပ်ထားခြင်းသည် စာအုပ်အပြည့်အစုံကို ပြန်လည်ထုတ်ဝေခွင့်မဟုတ်ပါ။ Rights holder ၏ ခွင့်ပြုချက်/evidence မရမချင်း channel မှဖိုင်များကို download, OCR, store သို့မဟုတ် catalog publish မလုပ်ရ။

`@RO_Bookshelf` public bio တွင် “Free books” ဟုဖော်ပြပြီး မူရင်းစာရေးဆရာများနှင့် ထုတ်ဝေသူများကို credit ပေးကြောင်း ရေးထားသည်။ Post များတွင် `@readerodyssey_filesbot` မှတစ်ဆင့် စာဖတ်ရန် link များပါရှိသည်။ သို့သော် public preview တွင် redistribution license သို့မဟုတ် စာအုပ်အပြည့်အစုံကို အခြား website ပေါ် ပြန်တင်ခွင့်ကို မဖော်ပြထားပါ။ Rights-holder ခွင့်ပြုချက်/evidence မရမချင်း ထို channel မှစာအုပ်များကို download, OCR, store သို့မဟုတ် သုတရိပ်သာပေါ် publish မလုပ်ရ။ Source: https://t.me/RO_Bookshelf

## လက်ရှိအဆင့် — webhook receiver

- Production website တွင် `POST /api/telegram/webhook` ကို server-side receiver အဖြစ်အသုံးပြုသည်။ Route သည် Telegram `X-Telegram-Bot-Api-Secret-Token` header ကို `TELEGRAM_WEBHOOK_SECRET` နှင့် constant-time comparison လုပ်ပြီး `TELEGRAM_ALLOWED_CHAT_IDS` ထဲရှိ `group`/`supergroup`/`channel` များမှ `message`, `edited_message`, `channel_post`, `edited_channel_post` update များထဲက PDF document သို့မဟုတ် photo media ကိုသာ `accepted` ဟုတုံ့ပြန်သည်။
- Request JSON ကို 256 KiB အထိကန့်သတ်သည်။ Secret မမှန်လျှင် `401`, JSON မမှန်လျှင် `400`, body ကြီးလွန်းလျှင် `413`, environment configuration မပြည့်စုံလျှင် `503` ပြန်ပေးသည်။ ခွင့်မပြုထားသော chat သို့မဟုတ် မသက်ဆိုင်သော update/media ကို Telegram retry မဖြစ်စေရန် `200 ignored` ပြန်ပေးသည်။
- Log ထဲတွင် `update_id` နှင့် media type ကိုသာမှတ်တမ်းတင်သည်။ Caption, user details, chat ID, file ID နှင့် raw update များကို မ log လုပ်ပါ။ ယခုအဆင့်တွင် Telegram ဖိုင်ကို download/OCR မလုပ်၊ database/object storage ထဲမသိမ်း၊ catalog မပြင်ဆင်/မထုတ်ဝေပါ။ `accepted` သည် update ရောက်ရှိပြီး filter ကိုကျော်ခဲ့သည်ဟုသာဆိုလိုပြီး durable ingestion သို့မဟုတ် rights approval ပြီးကြောင်း မဆိုလိုပါ။
- Production runtime တွင် `TELEGRAM_WEBHOOK_SECRET` နှင့် comma-separated numeric ID များဖြစ်သော `TELEGRAM_ALLOWED_CHAT_IDS` ကို protected environment settings အဖြစ်ထားရမည်။ လက်ရှိ `TELEGRAM_BOT_TOKEN` ကို source ထဲမထည့်ဘဲ Telegram Bot API `setWebhook` အတွက်သာသုံးရမည်။

## နောက်တစ်ဆင့် — full ingestion pipeline

Rights evidence အတည်ပြုပြီးမှ persistent queue/idempotency၊ Telegram `getFile`၊ MIME နှင့် byte-size စစ်ဆေးခြင်း၊ malware scan၊ private object storage၊ database schemas၊ OCR၊ admin review၊ rights record နှင့် approval ပြီးမှ catalog publish လုပ်ခြင်းကို သီးခြားတည်ဆောက်မည်။ Group/channel ထဲဖိုင်ရှိနေခြင်းတစ်ခုတည်းကို publication permission အဖြစ် ဘယ်တော့မှ မယူဆရ။


## နောက်အဆင့်အတွက် architecture မှတ်စု

Persistent `IngestionJob` ကို `telegramUpdateId` ဖြင့် idempotent လုပ်ပြီး group/channel allowlist နှင့် file type အပြင် uploader/rights evidence ကိုစစ်ရမည်။ Rights ခွင့်ပြုချက်ရပြီးမှ `getFile` ဖြင့် download, MIME/size validation, malware scan, private object storage နှင့် OCR ကိုလုပ်မည်။ အကြံပြု entity များမှာ `Book`, `BookPage`, `Asset`, `RightsRecord`, `IngestionJob` ဖြစ်သည်။ စာအုပ်များသည် admin rights review မပြီးမချင်း `draft` အဖြစ်သာရှိပြီး အတည်ပြုပြီးမှ catalog ထဲ publish လုပ်မည်; reader သည် Telegram raw URL သို့မဟုတ် permanent download link မပေးရ။

## API source

Telegram Bot API reference (getChat, getUpdates, setWebhook, update payloads): https://core.telegram.org/bots/api
