const knownTitleCorrections: Readonly<Record<string, string>> = {
  "xj3aq3cyzsn4": "ဝင်းဖေ ဝတ္ထုတိုများ",
  "ကမာ႓ေလာကၾကီးကို သာယာေစရင္ သင့္မ်က္ႏွာကို အရင္ၿပံဳးထားလုိက္ပါ":
    "ကမ္ဘာလောကကြီးကို သာယာစေရင် သင့်မျက်နှာကို အရင်ပြုံးထားလိုက်ပါ",
  "အေဖနဲ့ကၽြန္ေတာ္ (A phay hnint kyon taw)":
    "အဖေနဲ့ကျွန်တော် (A phay hnint kyon taw)",
  "မိတ္ေဆြသူငယ္ခ်င္း (Mate Sway Thu Ngal Chin) - ႏိုင္းႏိုင္းစေန Nine Nine Sanay":
    "မိတ်ဆွေသူငယ်ချင်း (Mate Sway Thu Ngal Chin) - နိုင်းနိုင်းစနေ Nine Nine Sanay",
  "ဘာေတြပဲျဖစ္ေနေန အေဖလာမယ္ စိတ္ခ်":
    "ဘာတွေပဲဖြစ်နေနေ အဖေလာမယ် စိတ်ချ",
  "Nor Naw - Phat Htar Mel ဖက္ထားမယ္ covered by The Four":
    "Nor Naw - Phat Htar Mel ဖက်ထားမယ် covered by The Four",
  "ရွှေဥဒါင်း -သိုက်အရစွန့်စားသူ(အပိုင်း၂) ဇာတ်သိမ်းပိုင်း.m4a":
    "ရွှေဥဒေါင်း - သိုက်အရစွန့်စားသူ (အပိုင်း ၂) ဇာတ်သိမ်းပိုင်း.m4a",
};

/** Correct only reviewed legacy titles; leave all other metadata unchanged. */
export function correctedCatalogTitle(title?: string | null): string {
  const value = title ?? "စာအုပ်အသစ်";
  return knownTitleCorrections[value] ?? value;
}
