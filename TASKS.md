# TASKS — الفرق بين اللعبة الحالية و Stronghold Crusader

الحالة: `[ ]` لسه — `[~]` جزئي — `[x]` تم.
الأولوية: **P0** لازم الأول (بيكسر الإحساس) — **P1** أساسي للـ gameplay — **P2** محتوى — **P3** تلميع.

> ملاحظة قانونية: `ref/` فيه ملفات اللعبة الأصلية (محمية بحقوق). بنستخدمها **كمرجع للأرقام والسلوك فقط** (aiv / maps / manual)،
> ومبندفعهاش على GitHub. الرسومات لازم تفضل CC0 / مرخّصة (Kenney، FeudalWars، Rubberduck).

---

## A. الـ Controller / الإدخال (`js/input.js`) — P0

الحالي: تحديد بسحب (الجنود بس)، أمر بزر أيمن، كاميرا WASD، `H` للإيقاف.

- [ ] **A1 (P0)** تحديد الفلاحين بالسحب أو على الأقل Double-click = تحديد كل وحدات نفس النوع على الشاشة (زي SHC).
- [ ] **A2 (P0)** مجموعات التحكم: `Ctrl+1..9` تحفظ، `1..9` تستدعي، ضغطتين = الكاميرا تروح للمجموعة. (**تعارض حالي:** `1..8` مستخدمة للبناء → ننقل البناء لأزرار/قوائم زي SHC.)
- [ ] **A3 (P0)** سحب الكاميرا بحافة الشاشة (edge scrolling) + زرار أيمن مضغوط للسحب اختياري.
- [ ] **A4 (P0)** حساب الـ picking: النقر على مبنى/وحدة لازم يستخدم الـ hitbox المرسوم (الارتفاع + الـ sprite) مش البلاطة الأرضية بس.
- [ ] **A5 (P0)** Zoom: خطوات ثابتة (SHC فيه zoom بسيط) + منع الـ blur (Zoom على أرقام صحيحة أو تفعيل `imageSmoothing` حسب النسبة).
- [ ] **A6 (P1)** أوامر الجنود: Stand / Hold / Patrol (`P`) / Attack-move (`A` + نقرة) / Disband.
- [ ] **A7 (P1)** Formation حركة (الوحدات المتحددة متتكدسش على نفس النقطة؛ تتوزع في شبكة).
- [ ] **A8 (P1)** بناء الأسوار/الخنادق بالسحب (drag-line) بدل نقرة نقرة. Shift لسلسلة بناء.
- [ ] **A9 (P1)** Esc / Space (Pause) / `+ -` سرعة اللعبة / `F` رجوع للقلعة / `Tab` دورة على المباني الفاضية.
- [ ] **A10 (P1)** Right-click على مبنى مورد/مخزن = أمر جمع/توصيل تلقائي؛ Right-click على سور/برج = Garrison.
- [ ] **A11 (P2)** Cursor مخصص (sword / hand / delete / build) — الملفات الأصلية `ref/extracted/*.cur` مرجع فقط، نرسم بديل CC0.
- [ ] **A12 (P2)** Touch/Trackpad: دعم pinch-zoom وسحب بإصبعين.
- [ ] **A13 (P3)** Keyboard remap + شاشة اختصارات.

## B. Textures / الرسم (`js/render.js`, `js/art.js`, `tools/make-assets.js`) — P0

الحالي: أرض + 7 مباني real art، **الوحدات/الأشجار/الأسوار/الموارد مرسومة بالـ canvas primitives (ellipse/arc)** → شكلها مش قريب من SHC.

- [ ] **B1 (P0)** **الوحدات sprites حقيقية**: فلاح، سيف، رامي، رمح، قوس... بـ 8 اتجاهات × (idle/walk/attack/die). مصدر مقترح: حزم CC0 isometric characters؛ ننتج sprite-sheet عبر `make-assets.js`.
- [ ] **B2 (P0)** Texture الأرض: **blending بين البلاطات** (sand↔grass↔rock) بدل بلاطات مربعة مقطوعة + تنويع عشوائي (variants) لكسر التكرار + ميلان ارتفاع (height) بسيط.
- [ ] **B3 (P0)** الأشجار: sprites متنوعة (3-4 أنواع) + قطع الشجرة يغيّر الـ sprite (جذع) بدل اختفائها.
- [ ] **B4 (P0)** ترتيب الرسم (z-sort): مشاكل تداخل مبنى/وحدة/شجرة. نستخدم sort بـ `(x+y)` + ارتفاع الـ sprite + طبقات (أرض → ظل → مباني → وحدات → مؤثرات).
- [ ] **B5 (P0)** الأسوار: sprites بـ **auto-tiling** (وصلات: مستقيم / ركن / T / تقاطع) + أبراج بوابة + خطوة على السور (wall-walk).
- [ ] **B6 (P1)** المباني الناقصة sprites: مزرعة، محجر، منجم، برج (حاليًا بعضها placeholder) + مراحل بناء (scaffold → نص → كامل) + حالة تضرر + حريق + أنقاض.
- [ ] **B7 (P1)** ظلال حقيقية (اتجاه ثابت من الشمال-الغرب) بدل البيضاوي.
- [ ] **B8 (P1)** HUD بصري Stronghold-style: لوحة سفلية خشبية/جلدية، أيقونات حقيقية للموارد، Portraits للوحدات/المباني (بدل emoji).
- [ ] **B9 (P1)** Minimap: الألوان حسب الفريق/التضاريس + إطار الكاميرا + نقر يمين = أمر حركة.
- [ ] **B10 (P2)** تأثيرات: تراب خطوات، دخان، نار، سهم بمسار حقيقي (arc) + sprite للسهم، دم/ضرب خفيف، غبار انهيار.
- [ ] **B11 (P2)** الماء: بلاطات متحركة + شواطئ (shore blending).
- [ ] **B12 (P2)** Fog / Shroud: مناطق غير مكتشفة (SHC بيستخدم خريطة مكشوفة؛ نخليها اختياري).
- [ ] **B13 (P2)** Atlas/Spritesheet واحد + `drawImage` بدون `data:` URI عملاقة (حاليًا `art.js` Base64 كبير → أبطأ تحميل).
- [ ] **B14 (P3)** Day/night أو إضاءة خفيفة، جودة عالية على شاشات HiDPI (`devicePixelRatio`).

## C. الاقتصاد والمباني (`js/config.js`, `js/buildings.js`) — P1

SHC الأصلي: **سلاسل إنتاج** مش مخزون موارد واحد. الحالي: 5 موارد بس + 9 مباني.

- [ ] **C1 (P1)** **Stockpile + Granary + Armoury**: المخازن مباني حقيقية، والعمال بيوصّلوا لأقرب مخزن (مش للقلعة بس).
- [ ] **C2 (P1)** **الطعام الكامل**: Apple orchard، Dairy farm، Wheat farm → Mill → Bakery → Granary؛ Hunter's post؛ Inn (يوزّع جعة).
- [ ] **C3 (P1)** **Popularity (الشعبية)**: عوامل (ضريبة، طعام، جعة، ازدحام، تنوع طعام، دين) + تأثير على الهجرة والإنتاجية والفرار.
- [ ] **C4 (P1)** **Tax slider** (-/0/+) بدل ثوابت `TAX_POP/TAX_HOUSE`؛ **Rations** (0/نص/عادي/ضعف).
- [ ] **C5 (P1)** **Peasants spawn من Campfire/Keep** (لحد Max Pop) + Hovels + Church/Chapel/Cathedral للشعبية.
- [ ] **C6 (P1)** **Engineer's Guild + Tunneler's Guild + Mason's Guild** + Siege camp (للـ siege units).
- [ ] **C7 (P1)** مباني الأسلحة: Fletcher (قوس/Crossbow)، Poleturner (رمح/Pike)، Blacksmith (سيف/Mace)، Armourer (درع) → Armoury → Barracks.
- [ ] **C8 (P1)** **Wood → Hauler → Stockpile** حركة العمال الفعلية (carry) + حدود التخزين + Hovel/كابينة.
- [ ] **C9 (P2)** مباني دفاعية: Gatehouse، Postern، Turret، Lookout، Square/Round/Crossbow tower، Keep upgrade، Moat/Pitch ditch، Killing pits، Oil smelter.
- [ ] **C10 (P2)** **Pitch / Oil** + Brazier + Fire (حرق).
- [ ] **C11 (P2)** Market / Trading (بيع/شراء موارد بأسعار تتغير).
- [ ] **C12 (P3)** Entertainment: Stocks، Gallows، Dungeon، Cage (يؤثر على الشعبية/الخوف).

## D. الوحدات والقتال (`js/units.js`) — P1

الحالي: peasant + swordsman + archer (+ نسخة العدو). **SHC فيه ~20 وحدة**.

- [ ] **D1 (P1)** **جنود أوروبيون**: Archer، Spearman، Pikeman، Maceman، Crossbowman، Swordsman، Knight، Monk.
- [ ] **D2 (P1)** **جنود عرب**: Arabian Archer، Slave، Slinger، Assassin، Horse Archer، Arabian Swordsman، Fire Thrower.
- [ ] **D3 (P1)** **Siege**: Catapult، Trebuchet، Battering Ram، Siege Tower، Mangonel، Ballista، Portable Shield.
- [ ] **D4 (P1)** **Armor / Damage types**: سهم، رمح، سيف، حجر كاتابولت، نار، زيت — جدول ضرر × دروع.
- [ ] **D5 (P1)** **Morale / Fear / Stances** (aggressive/defensive/stand-ground) + Retreat.
- [ ] **D6 (P1)** **Attack walls**: الجنود بتتسلق سلالم/Siege tower على الأسوار؛ Wall walkers (مدافعين) يمشوا على الجدار.
- [ ] **D7 (P1)** **Garrison** في الأبراج والقلعة + Archer's tower fires بعدد المدافعين.
- [ ] **D8 (P2)** **Pathfinding**: Flow-field أو HPA* + تجنب وحدات (steering) + تفادي الأسوار المقفولة.
- [ ] **D9 (P2)** **Stuck handling** للوحدات (re-path) + تجميعة (Group move).
- [ ] **D10 (P2)** **Lord (اللورد)**: الوحدة الأساسية، Death = خسارة (SHC rule).
- [ ] **D11 (P2)** أصوات الوحدات (select/attack/die) — مرجع في `ref/fx` لكن لازم بدائل CC0.

## E. الذكاء الاصطناعي (`js/ai.js`) — P1

الحالي: قاعدة ثابتة + موجات بنفس الشكل. SHC عنده **16 AI lord** بشخصيات مختلفة.

- [ ] **E1 (P1)** تحليل ملفات `ref/aiv/*.aiv` (صيغة ثنائية: **مواضع بناء + أسلحة + أوامر**) — نكتب `tools/parse_aiv.py` تطلع JSON لكل Lord (Rat، Snake، Pig، Wolf، Saladin، Caliph، Sultan، Richard، Frederick، Phillip، Emir، Nizar، Abbot، Marshal، Wazir، Sultan).
- [ ] **E2 (P1)** AI يبني اقتصاد حقيقي (مش قاعدة جاهزة): Wood → Stone → Food → Weapons → Army.
- [ ] **E3 (P1)** AI يستخدم Siege + ثغرات في الجدار + Tunnels.
- [ ] **E4 (P2)** 4-8 AI فرق (Skirmish) + تحالفات.
- [ ] **E5 (P2)** صعوبات (Easy / Normal / Hard / Very hard) + AI behaviors (Rush / Turtle / Siege / Economic).

## F. الخريطة والمحتوى — P2

الحالي: خريطة **64×64** عشوائية، قاعدة لاعب + قاعدة عدو.

- [ ] **F1 (P2)** خرائط أكبر (SHC من 100×100 لـ 400×400) + chunked rendering + culling.
- [ ] **F2 (P2)** **Map Editor** / مولّد: ارتفاعات (Height levels)، صخور كبيرة، بحيرات، حقول بترول (Pitch).
- [ ] **F3 (P2)** دعم تحميل خرائط SHC (`ref/maps` / `ref/mapsextreme` صيغ `.map` / `.sav`) عبر `tools/parse_map.py` ← JSON.
- [ ] **F4 (P2)** حملات: Crusader Trail (Military) + Economic + Skirmish Trail (إحصائيات في `ref/extracted/extremeTrail.csv`).
- [ ] **F5 (P3)** Siege scenarios / Invasion / Battle (مراحل Crusader Extreme).

## G. تجربة اللعب (UI/UX) — P1/P2

- [ ] **G1 (P1)** شاشة رئيسية + اختيار اللورد + الصعوبة + حجم الخريطة (بدل البدء المباشر).
- [ ] **G2 (P1)** Save / Load (`localStorage` أو ملف JSON) + Autosave.
- [ ] **G3 (P1)** Pause + سرعة اللعبة (0.5× / 1× / 2×) + شاشة إحصائيات نهاية اللعب.
- [ ] **G4 (P2)** Tooltips + Event log (رسائل زي "مجاعة!" / "هجوم!") + Advisor.
- [ ] **G5 (P2)** Hotkeys في الـ HUD + Multi-select panel (أيقونات الوحدات المحددة، Click لاختيار نوع واحد).
- [ ] **G6 (P2)** موسيقى + أصوات بيئة: Medieval/Arabic tracks (CC0)، Click/Build/Hit SFX (بدائل CC0).
- [ ] **G7 (P3)** Multiplayer (WebRTC/WebSocket) — بعيد.

## H. جودة الكود والأداء — P2/P3

- [ ] **H1 (P2)** فصل `render.js` (786 سطر) لـ modules: `terrain`, `buildings`, `units`, `fx`، وتنظيف `index.html` المبني (4000+ سطر generated).
- [ ] **H2 (P2)** Spatial hash للوحدات/المباني (حاليًا loops خطية → بطيء مع جيش كبير).
- [ ] **H3 (P2)** Fixed timestep (simulation 20-30Hz) منفصل عن الرسم + determinism (يمهّد لـ replay/multiplayer).
- [ ] **H4 (P3)** Dirty-rect / offscreen caching لطبقة الأرض (موجود `bake`؛ نوسّعه للمباني الثابتة).
- [ ] **H5 (P3)** اختبارات (`node --test`) للـ pathfinding والاقتصاد والـ AI.
- [ ] **H6 (P3)** GitHub Actions: `node build.js` تلقائي قبل deploy (حاليًا `index.html` بيتبني يدويًا).

---

## I. الأنيميشن + رحلة المنتج (Production Chain) — **P0** (أولوية قصوى)

**التشخيص من الكود (`js/units.js` ~148-214، `js/render.js` `drawUnit`):**
- العامل بيعدّي بـ states: `idle → toRes → gather → toDrop → idle`. مفيش states للشغل نفسه (قطع/حفر/حصاد/تحميل/تفريغ).
- `gather` مجرد **عدّاد وقت (timer)** والعامل واقف ساكت، وبعدين ياخد المورد ويروح `nearestDrop` = **القلعة (keep) على طول**. مفيش مخزن وسيط، ومفيش مبنى معالجة.
- الإنتاج بيظهر في `G.res_count` فورًا لما العامل يوصل القلعة. مفيش حاجة تتشاف في الأرض (لا كومة خشب، لا مخزن، لا عربية).
- `drawUnit` بيرسم بيضاوي + دايرة بنفس الشكل في كل الحالات، من غير frames ولا اتجاه (مفيش facing).
- مفيش أي نظام animation في اللعبة: مفيش sprite-sheet ولا frame index ولا clock لكل وحدة ولا animation للمباني (طاحونة، دخان، نار، أعلام).

### I1. نظام الأنيميشن (الأساس)
- [ ] **I1.1 (P0)** `Anim` core: كل وحدة عندها `anim = {clip, frame, t, dir}`. clips: `idle, walk, run, work_*, carry_walk, attack, shoot, hit, die, pray, sit`. fps لكل clip.
- [ ] **I1.2 (P0)** **8 اتجاهات (facing)** من متجه الحركة/الهدف (N, NE, E, SE, S, SW, W, NW) + الوقوف يفضل على آخر اتجاه.
- [ ] **I1.3 (P0)** Sprite-sheets للوحدات: `tools/make-assets.js` يبني atlas (`units.png` + `units.json`: clip × dir × frames). مصدر CC0 isometric characters؛ لو مفيش 8 اتجاهات: 4 اتجاهات + flip أفقي.
- [ ] **I1.4 (P0)** Teamcolor: طبقة mask لون الفريق (أزرق/أحمر) على الدروع/الملابس بدل تلوين الشكل كله.
- [ ] **I1.5 (P1)** Animation للمباني: دخان مداخن، دوران طاحونة، مطرقة الحداد، نار الفرن، علم القلعة، نار لما يتضرر، انهيار + أنقاض.
- [ ] **I1.6 (P1)** Animation للبيئة: أشجار تتمايل، ماء، أعلام، طيور (ambient).
- [ ] **I1.7 (P1)** Animation للموارد: شجرة تتقطع (3 مراحل ثم جذع)، صخرة تتكسر مراحل، حقل قمح ينمو (نبتة → ناضج → حصاد → أرض فاضية).
- [ ] **I1.8 (P1)** Animation للقتال: ضرب (swing) متزامن مع لحظة الضرر (hit frame)، سهم يطير + ارتداد، موت (سقوط) + جثة تختفي تدريجيًا.
- [ ] **I1.9 (P2)** Idle variations عشوائية (يحك رأسه، يتلفت) + عمال بتتمشى/تقعد لما مفيش شغل.

### I2. رحلة العامل (حالات الشغل بالتفصيل)
مثال **الحطّاب (Woodcutter)** — بدل `toRes → gather → toDrop` الحالي:
`قاعد بالبيت/المنشرة → يطلع لأقرب شجرة → يوصلها (walk) → يقطع (chop anim + صوت + رقاقات خشب) → الشجرة تقع (مراحل) → يحمّل الجذوع على كتفه (carry_walk بـ sprite مختلف) → يمشي لأقرب **Stockpile** → يفرّغ (drop anim) → يرجع للشجرة اللي بعدها`.
- [ ] **I2.1 (P0)** إعادة كتابة `workerAI` كـ **state machine واضحة** لكل مهنة، كل state ليه clip. الـ states: `idle, goto_source, work, load, goto_dest, unload, wait/queue, return_home`.
- [ ] **I2.2 (P0)** الحطّاب: يقطع شجرة بعينها (مش بلاطة)، الشجرة تتقطع بعد N ضربات، يحمل حزمة خشب مرئية، يوصّل **Stockpile** (مش القلعة).
- [ ] **I2.3 (P0)** **Stockpile (مخزن خشب/حجر/حديد)** كمبنى حقيقي مع كومة مرئية بتكبر على حسب الكمية. **Granary** للأكل. **Armoury** للأسلحة. (يربط بـ C1).
- [ ] **I2.4 (P0)** رحّال/ناقل (Hauler) من مبنى لمبنى لما الخامات تتنقل بين المباني (حديد → حداد، قمح → طاحونة).
- [ ] **I2.5 (P1)** **المحجر (Stone)**: عامل يحفر الصخرة (pickaxe anim) → عربة/ثور يحمّل حجر → Stockpile. (SHC بيستخدم ox-cart.)
- [ ] **I2.6 (P1)** **الحديد (Iron)**: عامل منجم → يحمل → Stockpile → Blacksmith/Armoury.
- [ ] **I2.7 (P1)** **القمح → خبز:** Wheat farmer (زرع/حصاد) → Mill (طحن) → Bakery (خبز) → Granary. كل خطوة بتاخد وقت + animation + نقل مرئي.
- [ ] **I2.8 (P1)** **الأسلحة:** Fletcher (قوس) من خشب، Poleturner (رمح) من خشب، Blacksmith (سيف/دبوس) من حديد، Armourer (درع) من حديد → Armoury → Barracks (تجنيد = يخلّص سلاح + ذهب).
- [ ] **I2.9 (P1)** **Peasant → جندي:** الفلاح يمشي للثكنة (anim) → يتحول (يلبس) → يطلع بتشكيلة.
- [ ] **I2.10 (P1)** **المهن بتتوزع من Campfire/Keep:** الفلاحين بيستنوا شغل (idle area) وبيتوزعوا على المباني اللي محتاجة عمال (عدد عمال لكل مبنى مش واحد).
- [ ] **I2.11 (P1)** **حالات الانتظار/الطابور:** لو المخزن زحمة أو مفيش خامة: العامل يستنى في الدور مش يختفي.
- [ ] **I2.12 (P2)** كل مبنى إنتاج بيعرض progress (شريط) + أيقونة العامل المشتغل + تحذير "مفيش مخزن / مفيش خامة".
- [ ] **I2.13 (P2)** Overlay للمسارات (Debug): خط يبين العامل رايح فين وجايب إيه.

### I3. Textures الجنود (الأولوية الأولى للشكل)
- [ ] **I3.1 (P0)** استبدال `drawUnit` (ellipse/arc) بـ `drawImage` من الـ atlas. Fallback للحالي لحد ما الأصول تجهز.
- [ ] **I3.2 (P0)** شخصيات منفصلة: فلاح، حطّاب، عامل حجر، عامل منجم، مزارع، خبّاز، حداد، جندي رمح/سيف/قوس/كروسبو، فارس، راهب. (ألوان/أدوات/لبس مختلف لكل مهنة.)
- [ ] **I3.3 (P0)** حجم/نسبة مظبوطة للمباني (الوحدات حاليًا أصغر/أكبر من اللازم بالنسبة للمبنى).
- [ ] **I3.4 (P1)** Selection ring + health bar + portrait على شكل SHC (دايرة خضرا تحت الوحدة، شريط رفيع).
- [ ] **I3.5 (P1)** أدوات في الإيد مرئية: فأس، معول، منجل، مطرقة + حمولة (حزمة خشب، حجر، أكياس).

---

## ترتيب التنفيذ المقترح

1. **Sprint 0 — الأنيميشن + رحلة المنتج (القسم I):** I1.1–I1.4، I3.1–I3.2، I2.1–I2.3 (حطّاب كامل بأنيميشن → Stockpile). ده أكبر فرق في الإحساس.
2. **Sprint 1 — Controller + Z-order:** A1–A5, B4.
3. **Sprint 2 — Textures:** B2, B3, B5, B7 (الأرض، الأشجار، الأسوار).
4. **Sprint 3 — Core Stronghold loop (باقي المهن):** I2.5–I2.10 مع C1–C5, D1–D2 (مخازن + شعبية + ضرايب + جنود أكتر).
5. **Sprint 4 — الدفاع والحصار:** C9, D3, D6, D7 (أسوار، بوابات، siege).
6. **Sprint 5 — AI + خرائط:** E1–E3, F1–F3.
7. **Sprint 6 — Polish:** G1–G6, B8–B12.
