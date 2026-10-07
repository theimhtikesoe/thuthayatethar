# သုတရိပ်သာ Deliverables

- [ ] **မြန်မာစာအုပ်များကို မျက်နှာဖုံး၊ ခေါင်းစဉ်နှင့် အခြေခံအချက်အလက်များဖြင့် လှပရှင်းလင်းစွာ ပြသသည့် စာကြည့်တိုက်ပင်မစာမျက်နှာ** — catalog cards၊ featured collection နှင့် responsive editorial layout ဖြင့် ပြသရမည်။
- [ ] **စာအုပ်ခေါင်းစဉ် သို့မဟုတ် သက်ဆိုင်ရာအချက်အလက်များဖြင့် ရှာဖွေနိုင်သည့် စာအုပ်ရှာဖွေမှု** — search input သည် ခေါင်းစဉ်၊ စာရေးဆရာ၊ summary နှင့် tag များအပေါ် ချက်ချင်း filter လုပ်ရမည်။
- [ ] **စာရေးဆရာ၊ စာအုပ်အမျိုးအစားနှင့် ခန့်မှန်းဖတ်ရှုချိန်အလိုက် စစ်ထုတ်ကြည့်ရှုနိုင်မှု** — author/category/time filter များကို ပေါင်းစပ်အသုံးပြုနိုင်ရမည်။
- [ ] **စာအုပ်တစ်အုပ်ချင်းစီအတွက် မျက်နှာဖုံး၊ စာရေးဆရာ၊ အမျိုးအစား၊ ဖတ်ရှုချိန်နှင့် စာအုပ်အကျဉ်းချုပ်ပါဝင်သည့် အသေးစိတ်စာမျက်နှာ** — selected book detail panel တွင် metadata နှင့် rights status ပါရမည်။
- [ ] **တရားဝင်ဖတ်ရှုခွင့်ရှိသော စာအုပ်အပြည့်အစုံများအတွက် စာမျက်နှာပြောင်းဖတ်နိုင်သည့် read-only reader** — reader တွင် previous/next page၊ page count နှင့် close action ပါရမည်။
- [ ] **Reader အတွင်း စာလုံးအရွယ်အစား၊ စာကြောင်းအကွာအဝေးနှင့် နောက်ခံဖတ်ရှုမုဒ်တို့ကို ချိန်ညှိနိုင်မှု** — type scale၊ leading နှင့် paper/sepia/night themes ပြောင်းနိုင်ရမည်။
- [ ] **စာသားရွေးချယ်ကူးယူခြင်း၊ ပုံမှန် download လုပ်ခြင်းနှင့် print ထုတ်ခြင်းတို့ကို UI အဆင့်တွင် တားဆီးထားသည့် read-only အတွေ့အကြုံ** — reader surface သည် selection မရ၊ context menu မရ၊ print CSS တွင် reader ကို မပြရ။
- [ ] **Desktop၊ tablet နှင့် mobile မျက်နှာပြင်များတွင် မြန်မာစာကို ကြည်လင်ဖတ်ရလွယ်ကူစွာ ပြသသည့် responsive UI** — 960px နှင့် 640px breakpoints တွင် layout ပြန်စီရမည်။
- [ ] **စာအုပ်အပြည့်အစုံ မပြသနိုင်သည့်အခါ မူပိုင်ခွင့်အခြေအနေကို ရှင်းလင်းဖော်ပြပြီး အကျဉ်းချုပ်နှင့် metadata ကိုသာ ပြသမှု** — summary-only book များတွင် reader action အစား rights notice ပြရမည်။
- [ ] **သတ်မှတ် Telegram group မှ PDF နှင့် photo updates များကို လုံခြုံစွာ လက်ခံသည့် webhook receiver** — Telegram secret-token header ကိုစစ်ဆေးပြီး configured group/supergroup chat ID မှ update များကိုသာ လက်ခံရမည်၊ PDF document နှင့် photo media ကိုသာ accepted ဟုတုံ့ပြန်ပြီး အခြား chat/message/media ကို ignore လုပ်ရမည်၊ request body ကို 256 KiB အထိကန့်သတ်ကာ caption/file ID/user details/raw update များကို log မလုပ်ရ၊ လက်ရှိအဆင့်တွင် ဖိုင်ကို download/OCR/storage/catalog publish မလုပ်ရ။
