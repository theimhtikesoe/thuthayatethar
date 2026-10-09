# သုတရိပ်သာ — Implementation & Design Plan

## Product scope

သုတရိပ်သာသည် မြန်မာစာအုပ်များကို ရှာဖွေ၊ စစ်ထုတ်၊ အကျဉ်းချုပ်ကြည့်ရှု၍ တရားဝင်ခွင့်ပြုထားသော အကြောင်းအရာများကို browser ထဲတွင်သာ ဖတ်ရှုနိုင်သည့် read-only online library prototype ဖြစ်သည်။ ပထမအဆင့်တွင် sample catalog နှင့် client-side reader ဖြင့် အတွေ့အကြုံကို အရင်တည်ဆောက်ပြီး စာအုပ် metadata/ဖိုင်များကို Database နှင့် File storage သို့ ချိတ်ဆက်နိုင်ရန် ဖွဲ့စည်းပုံကို ရှင်းလင်းထားမည်။

## Required behavior

- မြန်မာစာအုပ်များကို မျက်နှာဖုံးပုံစံ၊ ခေါင်းစဉ်နှင့် အခြေခံ metadata ဖြင့် ပင်မစာမျက်နှာတွင် ပြသမည်။
- ခေါင်းစဉ်၊ စာရေးဆရာ၊ အမျိုးအစားနှင့် အဓိကစာသားများဖြင့် ရှာနိုင်မည်။
- လက်ရှိ catalog တွင် ရှာဖွေမှုကိုသာ ဖော်ပြမည်။ အမျိုးအစားနှင့် ခန့်မှန်းဖတ်ရှုချိန် filter UI များကို ယာယီဖျောက်ထားပြီး ပြန်ဖွင့်လိုပါက အသုံးပြုနိုင်ရန် data/filter logic ကို ထိန်းထားမည်။
- စာအုပ်အသေးစိတ် panel တွင် အကျဉ်းချုပ်၊ metadata နှင့် ဖတ်ရန် action ပါမည်။
- တရားဝင်စာဖတ်ခွင့်ရှိသည့် sample books များအတွက် page-by-page reader ပါမည်။
- Text reader တွင် စာလုံးအရွယ်အစား၊ စာကြောင်းအကွာအဝေးနှင့် နောက်ခံ theme ချိန်ညှိနိုင်မည်။ ပုံစကင် PDF များကို mobile တွင် full-screen, pinch/double-tap zoom နှင့် ရှေ့/နောက် touch page-turn ဖြင့် ဖတ်ရှုနိုင်မည်။
- Reader UI တွင် selection/copy, download နှင့် print ကို တားဆီးထားမည်။ ၎င်းသည် UI-level deterrent ဖြစ်ပြီး အမှန်တကယ် content security အတွက် signed delivery, access control နှင့် DRM/streaming တို့ကို production အဆင့်တွင် ထပ်မံလိုအပ်မည်။
- မူပိုင်ခွင့်အခြေအနေကြောင့် full text မပြသနိုင်သည့် စာအုပ်များကို metadata/summary-only အဖြစ် သီးခြားဖော်ပြမည်။
- Desktop, tablet, mobile အားလုံးတွင် responsive ဖြစ်မည်။

## Design direction

- **Design movement:** Editorial minimalism + warm digital archive — စာအုပ်ဆိုင်အဟောင်း၏ စက္ကူနွေးနွေးခံစားချက်ကို ခေတ်မီ digital reading interface ဖြင့် ပေါင်းစပ်မည်။
- **Core principles:** ဖတ်ရလွယ်ခြင်း၊ စိတ်အေးချမ်းခြင်း၊ metadata ရှင်းလင်းခြင်း၊ အကြောင်းအရာကို UI ထက် ဦးစားပေးခြင်း။
- **Color philosophy:** အဓိက ink/navy (`#17212b`) သည် ယုံကြည်ရသော စာကြည့်တိုက်အရသာကို ဖန်တီးပြီး parchment (`#f5efe5`) နှင့် warm paper (`#fffdf9`) သည် စာဖတ်စိတ်ကို အားပေးမည်။ လက်မှတ်ရောင် marigold (`#e2a84b`) ကို brand signature အဖြစ် လမ်းညွှန်ချက်နှင့် active state များတွင်သာ အသုံးပြုမည်။
- **Layout paradigm:** အလယ်ဗဟို grid အစား editorial rail — ဘယ်ဘက်တွင် အမည်/ရှာဖွေမှု၊ အလယ်တွင် catalog flow၊ ညာဘက်တွင် collection note/filters အဖြစ် ခွဲထားသည့် asymmetric layout။ Mobile တွင် အစီအစဉ်လိုက် stacked ဖြစ်မည်။
- **Signature elements:** (1) စက္ကူအစွန်းလို rounded catalog cards, (2) marigold bookmark marker, (3) dark reader sheet ပေါ်ရှိ folio/page number။
- **Interaction philosophy:** စာအုပ်တစ်အုပ်ကို ရွေးချယ်ရာတွင် အေးဆေးပြီး ရှင်းလင်းသော transition; filter/search များက ချက်ချင်းအဖြေပြန်ပေးပြီး အသုံးပြုသူ၏ reading context ကို မပျောက်စေပါ။
- **Animation:** card hover တွင် 180ms အတွင်း cover အနည်းငယ် lift; reader open သည့်အခါ sheet opacity/translate ဖြင့် 240ms; prefers-reduced-motion ကို လေးစားမည်။
- **Typography system:** Myanmar-first stack `Noto Sans Myanmar`, `Myanmar Text`, `Padauk`, sans-serif; display headings များတွင် weight 700၊ body copy 400/500၊ metadata 12–13px uppercase Latin label + Myanmar value။
- **Brand essence:** “မြန်မာစာပေကို စိတ်အေးလက်အေး ရှာဖတ်နိုင်တဲ့ ဒစ်ဂျစ်တယ်စာကြည့်တိုက်” — သန့်ရှင်း၊ နွေးထွေး၊ စာပေဆန်။
- **Brand voice:** headline များမှာ တိုတောင်းပြီး စာပေဆန် (“ဖတ်ချင်စိတ်ကို ဒီမှာ စတင်ပါ”); CTA များမှာ ရှင်းလင်းပြီး ဖိအားမပေး (“စာမျက်နှာဖွင့်မည်”, “အကျဉ်းချုပ်ကြည့်မည်”)။
- **Wordmark & logo:** “သုတရိပ်သာ” စာလုံးအမှတ်အသားဘေးတွင် စာအုပ်ဖွင့်ထားသည့် half-sun mark; logo.svg တွင် လက်မှတ်ရောင် bookmark notch ပါမည်။
- **Signature brand color:** Marigold `#e2a84b` — စာအုပ်စာမျက်နှာကြားက အလင်းတန်းလို အမှတ်ရလွယ်သော brand marker။

## Implementation approach

- Next.js App Router + React client component ကို အသုံးပြုမည်။ Prototype data ကို `app/page.tsx` ထဲတွင် typed arrays အဖြစ် ထားမည်။
- Global CSS တစ်ခုတည်းဖြင့် responsive layout, Myanmar typography, reader themes နှင့် print/selection deterrents ကို ထိန်းမည်။ Dependency များကို အနည်းဆုံးထားမည်။
- `public/manus-routes.json` တွင် `/` နှင့် `/read` route များကို ထည့်မည်။ Reader ကို modal view အဖြစ် တင်ပြသောကြောင့် route က app entry ကို ကိုယ်စားပြုမည်။
- နောက်အဆင့်တွင် Database ကို book metadata index အဖြစ်၊ File storage ကို cover/content asset အဖြစ် ချိတ်နိုင်ရန် data shape တွင် `rights`, `fullText`, `pages` ကို သီးခြားထားမည်။

## Project structure

- `app/layout.tsx` — document metadata နှင့် app shell.
- `app/page.tsx` — catalog, filters, book detail drawer, reader state.
- `app/globals.css` — design tokens, layout, responsive rules, reader styles.
- `public/manus-routes.json` — route manifest.
- `public/logo.svg` — project wordmark/mark.
- `app.config.ts` — project logo metadata.
- `app/api/telegram/webhook/route.ts` — Telegram upload group မှ document/photo candidate update လက်ခံသည့် route; webhook secret နှင့် group allowlist ကိုစစ်ဆေးမည်။
- `.env.example` — secret တန်ဖိုးမပါသော runtime key အမည်များ။
- `docs/telegram-ingestion.md` — webhook လုပ်ဆောင်ပုံ၊ configuration နှင့် နောက်အဆင့် pipeline မှတ်စုများ။
- `docs/zawgyi-unicode-accuracy-and-test-cases.md` — conversion မပါသည့် reader ဆုံးဖြတ်ချက်၊ future note နှင့် navigation/UI test cases များ။
- `TODO.md` — approved deliverables and acceptance clauses.

## Telegram webhook phase

Webhook အဆင့်တွင် `POST /api/telegram/webhook` သည် အသုံးပြုသူ၏ allowlist ထဲရှိ upload group မှ `message`/`edited_message` update များအတွင်းက document/photo candidate ကိုသာ acknowledge လုပ်မည်။ Endpoint သည် file ကိုမဒေါင်းလုပ်ရယူသဖြင့် `accepted` ကို file scan ပြီးစီးသည်ဟု မယူဆရ၊ catalog ထဲတွင်လည်း မည်သည့်အကြောင်းအရာမျှ မထုတ်ဝေပါ။ နောက်အဆင့် pipeline တွင် Telegram `getFile`, file type/size/MIME/checksum/malware validation, private storage, OCR/text extraction, metadata draft နှင့် idempotent queue ပါဝင်မည်။ File တစ်ခုချင်းစီ၏ rights evidence ကို review အတည်ပြုပြီးမှ catalog ပေါ်တင်မည်; အချက်အလက်မပြည့်စုံလျှင် draft/quarantine တွင်ထားမည်။ Public channel များကို source အဖြစ်မသုံးပါ။
