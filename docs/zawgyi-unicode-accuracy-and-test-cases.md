# PDF Reader Update — Test Cases နှင့် Future Note

## လက်ရှိဆုံးဖြတ်ချက်

အသုံးပြုသူဖတ်ရှုမှု ရှုပ်ထွေးမသွားစေရန် app ထဲတွင် **Zawgyi/Unicode detection၊ conversion၊ OCR overlay နှင့် encoding toggle button မပါဝင်တော့ပါ**။ PDF ကို မူရင်းအတိုင်း render ပြမည်။ ထို့ကြောင့် မှန်ကန်ပြီးသား Unicode စာသားကို app က ထပ်ပြောင်းပြီး ပျက်စီးစေနိုင်သည့် risk မရှိတော့ပါ။

Zawgyi/Unicode ပြောင်းလဲမှုကို နောင်တွင် ပြန်ထည့်လိုပါက production feature အဖြစ် မထည့်မီ labeled PDF corpus၊ precision/recall metrics၊ mixed-content handling နှင့် user confirmation flow တို့ကို သီးခြား design လုပ်ရမည်။

## နောင်တွင် ပြန်စဉ်းစားမည်ဆိုပါက

- Unicode/Zawgyi conversion မလုပ်ဘဲ source PDF တွင် font embedding၊ ToUnicode map နှင့် rendering မှန်ကန်မှုကို အရင်စစ်ပါ။
- Conversion ပြန်လိုအပ်လာလျှင် page တစ်ခုလုံးမဟုတ်ဘဲ Myanmar paragraph အုပ်စုလိုက် ခွဲစစ်ပြီး confidence မသေချာလျှင် မပြောင်းဘဲ မူရင်းကို ထားပါ။
- Labeled sample set ဖြင့် false positive၊ false negative နှင့် character preservation rate ကိုတိုင်းပြီးမှ threshold သတ်မှတ်ပါ။
- OCR သုံးလျှင် OCR output ကို မူရင်း PDF အပေါ် အလိုအလျောက်ဖုံးမပြဘဲ သီးခြား optional text view အဖြစ်သာထားပါ။

## Test cases

| ID | အမျိုးအစား | လုပ်ဆောင်ရန် | မျှော်မှန်းရလဒ် |
|---|---|---|---|
| PDF-01 | Original rendering | Unicode ပါသော PDF ကိုဖွင့် | မူရင်း PDF ပုံအတိုင်းပြ၊ conversion/overlay မပေါ် |
| PDF-02 | Original rendering | Zawgyi font ပါနိုင်သော PDF ကိုဖွင့် | app က စာသားကို auto-convert မလုပ်၊ PDF rendering ကို မူရင်းအတိုင်းထား |
| PDF-03 | No conversion UI | Reader header ကိုကြည့် | Unicode/Zawgyi toggle သို့မဟုတ် conversion status button မရှိ |
| PDF-04 | Image-only | text layer မရှိသော PDF ကိုဖွင့် | PDF image ပြ၊ detector/converter error မဖြစ်၊ app မပျက် |
| PDF-05 | Asset failure | PDF worker မဟုတ်သော optional encoding assets မရှိဘဲ build/run | reader open/close နှင့် PDF rendering ပုံမှန် |
| NAV-01 | Previous page | Page 3 မှ “ရှေ့သို့” ကိုနှိပ် | ယခင် spread/page သို့ ပြန်သွား၊ button မပိတ်မိ |
| NAV-02 | First page | Page 1 တွင် previous ကိုကြည့် | previous button disabled ဖြစ်၊ page မပြောင်း |
| NAV-03 | Next page | Cover မှ “နောက်သို့” ကိုနှိပ် | page 2 သို့ တစ်မျက်နှာသာ ရွှေ့ |
| NAV-04 | Last page | နောက်ဆုံး page တွင် next ကိုကြည့် | next button disabled ဖြစ် |
| NAV-05 | Keyboard | ArrowLeft/ArrowRight ကိုနှိပ် | previous/next page ပြောင်းမှု button နှင့်တူညီ |
| NAV-06 | Progress | page slider ဖြင့် အလယ် page သို့သွားပြီး previous နှိပ် | သတ်မှတ်ထားသော page မှ ယခင် page သို့မှန်ကန်စွာပြန် |
| NAV-07 | Persistence | page ပြောင်းပြီး reader ပိတ်၊ ပြန်ဖွင့် | reading progress မပျက်၊ previous navigation ဆက်အလုပ်လုပ် |
| UI-01 | Desktop | 1280px+ reader header ကိုကြည့် | title၊ theme၊ offline၊ fullscreen controls မထပ်၊ alignment မပျက် |
| UI-02 | Tablet | 768px viewport တွင် reader ဖွင့် | controls များမပြိုကွဲ၊ title မဖုံး၊ touch target သင့်တော် |
| UI-03 | Mobile | 320px–390px viewport တွင် reader ဖွင့် | header controls များမလျှံ၊ title ellipsis အလုပ်လုပ်၊ previous/next footer အသုံးပြုနိုင် |
| UI-04 | Theme | paper၊ sepia၊ night သုံးမျိုးစမ်း | မူရင်း PDF image နှင့် reader controls contrast ဖတ်လို့ရ |
| UI-05 | Accessibility | Tab, Enter, Space ဖြင့် controls သုံး | focus ring မြင်ရ၊ button action အလုပ်လုပ်၊ aria-label များရှင်းလင်း |
| UI-06 | Reduced motion | `prefers-reduced-motion: reduce` ဖွင့် | animation များလျှော့/ပိတ်ပြီး navigation မပျက် |
| REG-01 | Build | `pnpm typecheck` နှင့် `pnpm build` run | နှစ်ခုလုံး pass |
| REG-02 | Existing features | reader open/close, zoom, offline save, fullscreen စမ်း | conversion ဖယ်ရှားမှုကြောင့် အခြား reader feature မပျက် |

## လက်ရှိ update အတွက် အရင် run ရမည့် cases

`PDF-01`–`PDF-05`, `NAV-01`–`NAV-07`, `UI-01`–`UI-05`, `REG-01` နှင့် `REG-02` ကို အရင်စမ်းသပ်ပါ။
