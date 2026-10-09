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

test("already-corrected titles and user-entered content are preserved", () => {
  const title = "မိတ်ဆွေသူငယ်ချင်း (Mate Sway Thu Ngal Chin) - နိုင်းနိုင်းစနေ Nine Nine Sanay";
  assert.equal(correctedCatalogTitle(title), title);
  assert.equal(correctedCatalogTitle("Custom book title"), "Custom book title");
  assert.equal(correctedCatalogTitle(), "စာအုပ်အသစ်");
});
