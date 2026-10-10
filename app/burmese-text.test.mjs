import test from "node:test";
import assert from "node:assert/strict";
import { correctedCatalogTitle } from "./burmese-text.ts";

test("the three reviewed Zawgyi catalog titles render in Unicode", () => {
  assert.equal(
    correctedCatalogTitle("ကမာ႓ေလာကၾကီးကို သာယာေစရင္ သင့္မ်က္ႏွာကို အရင္ၿပံဳးထားလုိက္ပါ"),
    "ကမ္ဘာလောကကြီးကို သာယာစေရင် သင့်မျက်နှာကို အရင်ပြုံးထားလိုက်ပါ",
  );
  assert.equal(
    correctedCatalogTitle("အေဖနဲ့ကၽြန္ေတာ္ (A phay hnint kyon taw)"),
    "အဖေနဲ့ကျွန်တော် (A phay hnint kyon taw)",
  );
  assert.equal(
    correctedCatalogTitle("မိတ္ေဆြသူငယ္ခ်င္း (Mate Sway Thu Ngal Chin) - ႏိုင္းႏိုင္းစေန Nine Nine Sanay"),
    "မိတ်ဆွေသူငယ်ချင်း (Mate Sway Thu Ngal Chin) - နိုင်းနိုင်းစနေ Nine Nine Sanay",
  );
  assert.equal(correctedCatalogTitle("ဘာေတြပဲျဖစ္ေနေန အေဖလာမယ္ စိတ္ခ်"), "ဘာတွေပဲဖြစ်နေနေ အဖေလာမယ် စိတ်ချ");
  assert.equal(
    correctedCatalogTitle("Nor Naw - Phat Htar Mel ဖက္ထားမယ္ covered by The Four"),
    "Nor Naw - Phat Htar Mel ဖက်ထားမယ် covered by The Four",
  );
  assert.equal(
    correctedCatalogTitle("ရွှေဥဒါင်း -သိုက်အရစွန့်စားသူ(အပိုင်း၂) ဇာတ်သိမ်းပိုင်း.m4a"),
    "ရွှေဥဒေါင်း - သိုက်အရစွန့်စားသူ (အပိုင်း ၂) ဇာတ်သိမ်းပိုင်း.m4a",
  );
});

test("the eight Myanmar Audio Books SoundCloud titles render in Unicode", () => {
  const corrections = new Map([
    ["ျမသန္းတင့္ - ေခတ္သစ္ပုေတၱာဝါဒ", "မြသန်းတင့် - ခေတ်သစ်ပုတ္တောဝါဒ"],
    ["ဓမၼာစရိယဦးေ႒းလိႈင္ - ရွင္အရဟံ မေထရ္", "ဓမ္မာစရိယဦးဋ္ဌေးလှိုင် - ရှင်အရဟံ မထေရ်"],
    ["ဓမၼာစရိယဦးေ႒းလိႈင္ - ေပါင္ေလာင္ရွင္ကႆပ", "ဓမ္မာစရိယဦးဋ္ဌေးလှိုင် - ပေါင်လောင်ရှင်ကဿပ"],
    ["စဥ္းစားျခင္း မိုးတိမ္နဲ႔ မစဥ္းစားျခင္း ေသတၱာ - ေမၿငိမ္း", "စဉ်းစားခြင်း မိုးတိမ်နဲ့ မစဉ်းစားခြင်း သေတ္တာ - မေငြိမ်း"],
    ["ဆရာေဇာ္ေဇာ္ေအာင္ ၏ ခင္သန္းႏုအေၾကာင္း၀တၳဳ", "ဆရာဇော်ဇော်အောင် ၏ ခင်သန်းနုအကြောင်းဝတ္ထု"],
    ["ေမာင္သိန္းေဇာ္ - ေတာင္ကုန္းအေဟာင္းမ်ား", "မောင်သိန်းဇော် - တောင်ကုန်းအဟောင်းများ"],
    ["ေဒါင္းကတဲ့ေန႔ - ေမာင္စိန္ဝင္း (ပုတီးကုန္း)", "ဒေါင်းကတဲ့နေ့ - မောင်စိန်ဝင်း (ပုတီးကုန်း)"],
    ["အိုင္ခ်င္း - မွာပါ့မယ္ေမာင္", "အိုင်ချင်း - မှာပါ့မယ်မောင်"],
  ]);
  for (const [legacy, unicode] of corrections) assert.equal(correctedCatalogTitle(legacy), unicode);
});

test("already-corrected titles and user-entered content are preserved", () => {
  const title = "မိတ်ဆွေသူငယ်ချင်း (Mate Sway Thu Ngal Chin) - နိုင်းနိုင်းစနေ Nine Nine Sanay";
  assert.equal(correctedCatalogTitle(title), title);
  assert.equal(correctedCatalogTitle("Custom book title"), "Custom book title");
  assert.equal(correctedCatalogTitle(), "စာအုပ်အသစ်");
  assert.equal(correctedCatalogTitle("xj3aq3cyzsn4"), "ဝင်းဖေ ဝတ္ထုတိုများ");
});

test("live audiobook titles with legacy Zawgyi metadata render in Unicode", () => {
  const corrections = new Map([
    ["05 - အသံထြက္၀တၳဳ- ေဆာင္းလုလင္ မ", "05 - အသံထွက်ဝတ္ထု - ဆောင်းလုလင် မ"],
    ["04 - အသံထြက္၀တၳဳ- လြန္းထားထား(ေဆးတကၠသုိလ္)- ေယာက်ာ္းတစ္ေယာက္ရဲ႕အခ်စ္", "04 - အသံထွက်ဝတ္ထု - လွန်းထားထား (ဆေးတက္ကသိုလ်) - ယောကျာ်းတစ်ယောက်ရဲ့အချစ်"],
    ["03 - အသံထြက္၀တၳဳ- ေမာင္သာခ်ိဳ- စစ္ေတာင္းႏွစ္လီ", "03 - အသံထွက်ဝတ္ထု - မောင်သာချို - စစ်တောင်းနှစ်လီ"],
    ["02 - အသံထြက္၀တၳဳ- မင္းရွင္- ေရာင္းခါစ", "02 - အသံထွက်ဝတ္ထု - မင်းရှင် - ရောင်းခါစ"],
    ["01 - အသံထြက္၀တၳဳ- ျငိမ္းေက်ာ္ သုသန္၌ သနပ္ခါးလူးျခင္း", "01 - အသံထွက်ဝတ္ထု - ငြိမ်းကျော် သုဿန်၌ သနပ်ခါးလူးခြင်း"],
    ["Law Of Authority And Obidence (အုပ္ခ်ဳပ္ျခင္း နွင္႕ နာခံျခင္း တို႕၏ နိယာမ)", "Law Of Authority And Obidence (အုပ်ချုပ်ခြင်း နှင့် နာခံခြင်း တို့၏ နိယာမ)"],
    ["A Lesson Of Faith (ႏွလုံးသားမွယုံၾကည္မူ၏သင္ခန္းစာ)", "A Lesson Of Faith (နှလုံးသားမှ ယုံကြည်မှု၏ သင်ခန်းစာ)"],
  ]);
  for (const [legacy, unicode] of corrections) assert.equal(correctedCatalogTitle(legacy), unicode);
});
