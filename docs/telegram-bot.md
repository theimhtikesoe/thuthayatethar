# Private-group စာအုပ်ရှာဖွေရေး Bot

Worker သည် allowlist ထဲက private group အတွင်းတွင်သာ bot command များကို လက်ခံသည်။ Catalog ထဲရှိ `publication_status = 'published'` နှင့် intake `status = 'published'` ဖြစ်သော စာအုပ်များကိုသာ ရှာဖွေ/ပေးပို့နိုင်သည်။ Group ထဲ file တင်ထားခြင်းဖြင့် bot က ချက်ချင်းမပေးပို့ပါ။ Rights review နှင့် admin publish အဆင့်များကို ကျော်မထားပါ။

## အသုံးပြုသူ flow

- `/start` သို့မဟုတ် `/help` — onboarding လမ်းညွှန်ပြသည်။
- `/search [စာအုပ်အမည်/စာရေးသူ]` — title, author, category, summary ကို ရှာသည်။
- ရလဒ် button ကို နှိပ်သောအခါ private R2 မှ approved PDF ကို `sendDocument` ဖြင့် group ထဲ ပြန်ပို့သည်။ Telegram raw file URL ကို မဖော်ပြပါ။
- `TELEGRAM_REQUIRED_CHAT_IDS` သတ်မှတ်ထားပါက user သည် ထို channel/group အားလုံး၏ member ဖြစ်မှသာ command နှင့် file delivery ကို သုံးနိုင်သည်။ Bot သည် channel များတွင် administrator/member အဖြစ် စစ်ဆေးနိုင်ရမည်။

## Deployment checklist

1. Bot ကို private group ထဲထည့်ပြီး group ID ကို ရယူပါ။ Numeric ID ကို `TELEGRAM_ALLOWED_CHAT_IDS` ထဲတွင်သာ ထည့်ပါ။ `wrangler.toml.example` ထဲရှိ ID သည် နမူနာဖြစ်ပြီး new group ID ဖြင့် အစားထိုးရမည်။
2. Required channel များကို `TELEGRAM_REQUIRED_CHAT_IDS` ထဲတွင် comma-separated IDs/usernames ဖြင့် သတ်မှတ်ပါ။ မလိုအပ်ပါက blank ထားနိုင်သည်။
3. `TELEGRAM_BOT_TOKEN` နှင့် `TELEGRAM_WEBHOOK_SECRET` ကို secret manager ထဲတွင်သာ ထည့်ပါ။ Git/chat ထဲ မထည့်ပါနှင့်။
4. Bot က group ရှိ `/search` command များကို မြင်ရန် BotFather တွင် privacy mode ကို disable လုပ်ပါ သို့မဟုတ် bot ကို admin လုပ်ပါ။
5. `setWebhook` မလုပ်မီ staging တွင် `/health`, synthetic `/start`, `/search`, membership failure နှင့် callback file delivery ကို စမ်းပါ။ Pending updates များမဖျက်ရန် `drop_pending_updates=true` မသုံးပါနှင့်။
6. Public channels သို့မဟုတ် အခြားသူများ၏ posts များကို source အဖြစ် အလိုအလျောက် မကူးယူပါ။ Rights evidence review ပြီး approved ဖြစ်သော files များကိုသာ catalog ထဲ publish လုပ်ပါ။

## Notes

- Cloud Bot API 20 MB download limit ကျော်သော intake files များအတွက် Local Bot API/relay သည် သီးခြားလိုအပ်သည်။ Delivery သည် Telegram `sendDocument` အရွယ်အစားကန့်သတ်ချက်များနှင့်လည်း ကိုက်ညီရမည်။
- Membership check မအောင်မြင်လျှင် bot သည် ရှာဖွေမှုရလဒ် သို့မဟုတ် စာအုပ်ဖိုင်ကို မပေးပို့ပါ။
