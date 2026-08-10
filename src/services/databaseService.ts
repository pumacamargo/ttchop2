import { auth, firestore, storage } from '../config/firebase';
import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  getDoc,
  deleteDoc,
  writeBatch,
  arrayRemove
} from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from 'firebase/storage';

export type VideoSource = 'recorded' | 'ai_generated';

export interface ProductVideo {
  id: string;
  name: string;
  downloadUrl: string;
  duration: number;
  section: string; // categoría dentro del producto, ej. "Camping", "Estudio", "IA Generado"
  source: VideoSource;
  trimStart: number; // segundos, default 0 - usado como default al agregar el clip a una edición
  trimEnd: number; // segundos, default = duration
  storagePath?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  userId: string;
  name: string;
  description: string;
  modelSheetUrls: string[];
  videos: ProductVideo[];
  customBaseVideoUrls?: string[];
  region?: string; // codigo de pais de origen del producto (ej. 'jp', 'mx'), lo llena la extension al importar
  sourceId?: string; // id del producto de TikTok Shop, usado por la extension para no duplicar al re-scrapear
  updatedAt?: string;
  createdAt: string;
}

export const REGION_LABELS: Record<string, string> = {
  jp: 'Japan',
  mx: 'Mexico'
};

export interface SessionVideo {
  id: string;
  name: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  duration: number;
  source: VideoSource;
  trimStart: number;
  trimEnd: number;
  createdAt: string;
  metadataStatus?: 'processing' | 'ready' | 'error';
  aiMetadata?: any;
}

export interface Session {
  id: string;
  userId: string;
  name: string;
  productIds: string[]; // links to zero or more products; deleting a product only unlinks, never deletes the session
  videos: SessionVideo[];
  createdAt: string;
}

export type TemplateType = 'aiGen' | 'collage' | 'voice' | 'overlay';

export interface Template {
  id: string;
  userId?: string;
  type: TemplateType;
  title: string;
  description: string;  // short summary shown in the card
  content?: string;     // full template text body (system prompt or script structure)
  voiceId?: string;     // ElevenLabs voice ID (only for type 'voice')
  referenceVideoUrl?: string;
  createdAt: string;
}

export type RenderType = 'ai' | 'collage' | 'overlay' | 'collage+overlay';
export type RenderStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface Render {
  id: string;
  userId: string;
  type: RenderType;
  status: RenderStatus;
  productId: string;
  productName: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduledRenderStatus = 'pending' | 'running' | 'done' | 'failed';
export type ScheduledRenderType = 'collage' | 'overlay' | 'collage+overlay' | 'ai';

export interface ScheduledRender {
  id: string;
  userId: string;
  type: ScheduledRenderType;
  scheduledAt: string;  // ISO UTC
  localDate: string;    // YYYY-MM-DD in user's timezone
  timezone: string;
  status: ScheduledRenderStatus;
  productId: string;
  productName: string;
  sessionIds: string[];
  voiceTemplateId: string;
  collageTemplateId: string;
  language: string;
  overlayTemplateId: string;
  // AI video fields
  aiTemplateId?: string;
  model?: string;       // 'seedance' | 'veo3'
  extraNotes?: string;
  renderId?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface MasterVideo {
  id: string;
  userId: string;
  productId: string;
  templateId: string;
  extraNotes: string;
  language: string;
  scriptText: string;
  audioUrl: string;
  masterVideoUrl: string;
  customVideoUrl?: string;
  usedCombinations: string[];
  variationsCount: number;
  createdAt: string;
}

export interface VideoVariation {
  id: string;
  masterVideoId: string;
  userId: string;
  productId: string;
  bRollCombination: string[];
  combinationKey: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  videoUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// Preset Seed Data for empty accounts
const SEED_TEMPLATES: Array<{ type: TemplateType; title: string; description: string; content?: string; voiceId?: string }> = [
  // --- aiGen ---
  {
    type: "aiGen",
    title: "Ultra-Raw UGC (Price Hook)",
    description: "Handheld selfie, natural light, price-hook strategy with bilingual MX Spanish and Japanese dialogue options.",
    content: `ULTRA-RAW CASUAL UGC - HIGH CONVERSION PRICE-HOOK STRATEGY

This video takes place inside a completely normal, unedited home room (bedroom, living room, or study). The lighting is entirely natural and imperfect, relying on standard overhead warm ceiling lights or ambient window daylight. No studio lighting, softboxes, or professional gear are used.

The creator is a relatable individual in casual everyday home clothes (e.g., oversized t-shirt, hoodie, sweatpants). Their physical gestures, posture, and facial expressions look completely unscripted, natural, and authentic.

OUTPUT FORMAT (MANDATORY)

Output exactly:

[visual plan]:
visual description

[dialogue]:
dialogue only

Do not add any other sections. Do not add titles. Do not add explanations. Do not add notes. Do not add comments.

VISUAL PLAN (IN ENGLISH)

The visual plan must be written entirely in English.
The dialogue must never appear inside the visual plan.
Describe only visible physical actions, handling of objects, and camera physics.

Camera Setup & Physics:
- Framing: Imperfect handheld selfie angle, slightly off-center talking head, shot on a front-facing smartphone camera.
- Camera Movement: Organic, subtle hand shaking and minor micro-adjustments in position throughout the continuous shot.
- Environment: Casual, unarranged background with lived-in everyday objects.
- Cuts: Zero edits or jump cuts. One continuous, unedited raw smartphone recording.

Detailed Visual Sequence:
1. START (0:00 - 0:03): Creator looks into the lens, lifts [PRODUCT NAME] into the frame.
2. CLOSE-UP (0:03 - 0:07): Creator brings product closer, taps or runs a finger over key feature.
3. DEMONSTRATION (0:07 - 0:12): Quick practical demo of [PRODUCT ACTION / USE CASE].
4. SETTLING (0:12 - 0:16): Creator rests product on table, points casually downward toward CTA corner.
5. OUTRO (0:16 - 0:20): Creator keeps pointing while finishing sentence, reaches to stop recording.

DIALOGUE OPTIONS

Option A - MEXICAN SPANISH SLANG:
[dialogue]:
"La neta, no sé quién le puso este precio, pero está rarísimo. O sea, lo compré sin pensarlo tanto y cuando me llegó... ¡wow! Se los juro, al chile no esperaba que fuera así de bueno. Literal es de esas cosas que dices: «Okay, esto sí vale cada peso». Vayan a verlo al carrito aquí abajo en serio, porque luego estas cosas vuelan y ya no vuelven. Ahorita sigue en oferta y todavía hay stock, pero pónganse las pilas porque no creo que dure mucho."

Option B - JAPANESE CASUAL SLANG:
[dialogue]:
「ガチで、誰がこの価格設定にしたのか意味分かんないんだけど！正気？ってレベルでバグってる。正直そこまで期待しないでノリで買ってみたんだけど、届いてみたらマジでエグい…！久々に『あ、これ買いだわ』って思ったやつ。気になってる人は本気で下の黄色いカートからチェックしてみて。今ならまだ割引やってるけど、マジで秒で売り切れると思うから早めがおすすめ！」`
  },
  {
    type: "aiGen",
    title: "Epic Action Blockbuster",
    description: "Hollywood action parody: deadpan creator, cinematic chaos, then instant anticlímax casual CTA.",
    content: `EPIC ACTION BLOCKBUSTER UGC

This video takes place inside a standard modern apartment living room or workspace, but it is shot and edited with the absurd, over-the-top cinematic intensity of a Hollywood action blockbuster. The lighting features dramatic, highly contrasting shadows, sudden artificial lens flares, and aggressive, dynamic color grading.

The creator is a regular, casual individual whose completely ordinary appearance, clothing, and language contrast hilariously with the epic, cinematic scale of the video's production.

The video must feel like a self-aware, highly energetic parody ("Baka-CM") that goes viral on Japanese social media precisely because it treats a normal product launch like the end of the world.

OUTPUT FORMAT (MANDATORY)

Output exactly:

[visual plan]:
visual description

[dialogue]:
dialogue only

Do not add any other sections.
Do not add titles.
Do not add explanations.
Do not add notes.
Do not add comments.

VISUAL PLAN

The visual plan must be written entirely in English.

The dialogue must never appear inside the visual plan.

The visual plan should describe only visible actions and camera behavior.

Describe:

camera framing (extreme low-angle hero shots, tight fast-cutting close-ups, rotating 360-degree views)

camera movement (whip pans, aggressive handheld camera shakes, rapid kinetic zooming)

environment (standard apartment room transformed by dramatic cinematic lighting and overlay effects)

creator movement, deadpan serious facial expressions, and hyper-dramatic action poses

product positioning (placed like a legendary artifact on a desk, or center-stage in a vortex of effects)

product handling (lifted slowly like a powerful weapon, or pointed at with immense gravity)

transitions between shots (whip transitions, digital glitch cuts, simulated explosions shaking the frame)

Do NOT describe:

emotions

viewer reactions

marketing intentions

product benefits

product claims

The creator and the product must remain the primary visual focus throughout the entire video.
The contrast between the ordinary room and the epic visual effects must be completely clear.
Use intense digital shakes, heavy lens flares, and fast editing cuts to mimic an action movie trailer.

The visual flow should follow:

Low-angle dramatic close-up of the creator looking deadpan into the camera lens as an artificial lens flare flashes across the screen

Whip pan transition to a rotating camera shot of the product sitting on a desk, surrounded by superimposed digital smoke or spark effects

Rapid kinetic zoom onto the creator firmly gripping the product and raising it slowly into the air as the camera shakes violently

Smooth cut back to a wide selfie framing where the creator completely drops the dramatic look, points casually down to the lower left corner, and talks normally

Creator smiles naturally at the camera lens, holding the product right next to their face as the intense cinematic effects disappear entirely

DIALOGUE

The dialogue must be written entirely in VIDEO LANGUAGE.

The dialogue structure must strictly follow:

Deliver a hyper-dramatic, world-ending announcement introducing the arrival or existence of this specific product.

In a deep, intensely serious, and epic voiceover tone, briefly state one premium feature of the product as if it were a legendary superpower.

Completely break the cinematic tension in the final second, switching instantly to a casual, everyday conversational voice telling the user to check the price in the cart link below because it is a total steal.

The creator should sound like a professional movie trailer narrator for the first half, and a completely normal, friendly TikTok scroller for the second half.

The tone should be:

hyper-dramatic (first half)

deadpan serious (first half)

instant anticlimax / casual (second half)

conversational (second half)

Avoid:

mid-tier aggressive shouting

standard corporate sales pitches

realistic marketing explanations

maintaining the serious tone until the very end`
  },
  {
    type: "aiGen",
    title: "Ultra-Raw Casual UGC",
    description: "Raw single-take selfie, zero editing, casual honest product discovery — no hooks, no urgency.",
    content: `ULTRA-RAW CASUAL UGC

This video takes place inside a completely normal, unedited room, such as a casual bedroom or living room setup. The lighting is completely natural and imperfect, using standard overhead room lights or daylight from a window without any professional studio gear.

The creator is an ordinary, relatable individual wearing casual, everyday home clothes. Their appearance, language, and unscripted behavior naturally match the specified VIDEO LANGUAGE and target audience.

The video must look like a completely spontaneous, raw video clip uploaded by a regular social media user with zero editing, zero filter, and absolutely no commercial intent.

OUTPUT FORMAT (MANDATORY)

Output exactly:

[visual plan]:
visual description

[dialogue]:
dialogue only

Do not add any other sections.
Do not add titles.
Do not add explanations.
Do not add notes.
Do not add comments.

VISUAL PLAN

The visual plan must be written entirely in English.

The dialogue must never appear inside the visual plan.

The visual plan should describe only visible actions and camera behavior.

Describe:

* camera framing (imperfect handheld selfie-style, slightly off-center talking head)
* camera movement (unsteady, natural smartphone shaking, casual minor adjustments mid-video)
* environment (unarranged room background, everyday household objects visible, real lived-in atmosphere)
* creator movement, completely natural facial expressions, casual blinking, and simple everyday hand gestures
* product positioning (held loosely in front of the camera, sometimes slightly out of center)
* product handling (turning it around casually, showing it to the lens in a non-professional manner)
* transitions between shots (no cuts at all, a single continuous unedited raw smartphone recording)

Do NOT describe:

* emotions
* viewer reactions
* marketing intentions
* product benefits
* product claims

The creator must remain the sole focal point in a single, continuous, unedited take.
The framing must look completely accidental and raw, avoid professional composition.
Use everyday, imperfect smartphone camera behavior with organic movement.

The visual flow should follow:

1. Creator looks at the smartphone screen, adjusts their grip on the phone slightly, and starts talking casually in a continuous selfie shot
2. Creator raises the product into the frame with one hand, turning it around slowly to show the front and back casually
3. Creator interacts with the product simply, tapping it or holding it up close to the camera lens for a brief moment
4. Creator brings the product back near their face, pointing a finger casually downward toward the screen corner
5. Creator finishes talking directly to the phone lens, keeping a relaxed, ordinary facial expression as the video rolls continuously

DIALOGUE

The dialogue must be written entirely in VIDEO LANGUAGE.

The dialogue structure must strictly follow:

1. Start directly without a hook, casually introducing the product like an everyday object they just happen to have in their hands.
2. Share a very simple, honest observation about what they personally like about using it, using only basic vocabulary that a ten-year-old child would understand completely.
3. Tell the viewer casually that if they want to check out how much it costs, the link is right down there on the screen.

The creator must sound like a regular person talking to a friend through a quick, spontaneous video message.

The tone should be:

* completely casual
* low-energy and relaxed
* entirely unscripted
* authentic

Avoid:

* any kind of marketing or sales buzzwords
* technical terms, specifications, or product features
* excited, fast-paced energetic speech
* direct sales pressure or call-to-action urgency`
  },
  {
    type: "aiGen",
    title: "Blockbuster Chaos (3 Sets)",
    description: "15-second hyperrealistic AI UGC across 3 blockbuster worlds. Includes a hidden Pomeranian easter egg in every video.",
    content: `# AI UGC BLOCKBUSTER CHAOS TEMPLATE

## PURPOSE

Generate a **15-second hyperrealistic AI UGC video** designed to maximize retention through nonstop blockbuster-level action, constant visual stimulation, and seamless product integration.

The creator is always the main character.

The product supports the adventure naturally but is never the main focus.

The video should feel like a real creator accidentally traveling through multiple blockbuster movies in one continuous cinematic adventure.

---

# VIDEO LENGTH

**15 seconds total**

The video is divided into **three distinct cinematic sets**, each lasting approximately **5 seconds**.

Each set should feel like a completely different blockbuster movie.

Every second should contain meaningful visual action.

No dead time.

No introductions.

No slow moments.

---

# VISUAL STYLE

The entire video must be completely **hyperrealistic**.

It should be indistinguishable from footage captured using a professional cinema camera.

Everything should look physically believable:

- realistic lighting
- realistic explosions
- cinematic motion blur
- believable creatures
- authentic environments
- natural facial expressions
- realistic physics
- cinematic depth of field
- realistic camera exposure
- natural color grading

The viewer should initially question whether the footage is real.

---

# VIDEO STRUCTURE

## SET 1 (0–5s)

### Immediate Chaos

The video begins immediately in the middle of an epic action sequence.

No greeting.

No explanation.

No setup.

The creator is already running, escaping, reacting, or surviving while the world around them falls apart.

Possible scenarios include:

- dinosaur attack
- alien invasion
- medieval battle
- zombie outbreak
- giant robots
- collapsing city
- pirate battle
- giant monster attack
- magical kingdom under siege
- space warfare
- jungle adventure
- cyberpunk city
- frozen kingdom
- underwater kingdom

The creator says little or nothing.

The visuals are the hook.

Every second should introduce new visual elements that reward continued watching.

---

## SET 2 (5–10s)

### Natural Product Usage

The environment suddenly transitions into a completely different blockbuster world.

The creator never stops moving.

Without interrupting the action, the creator naturally uses the product exactly as they normally would.

The product never pauses the story.

The creator may casually say only one short sentence, such as:

"Good thing I brought my [Product Name]."

"My [Product Name] always saves me."

"I never leave home without this."

The dialogue should sound effortless and authentic.

The product briefly appears on camera.

The creator immediately continues the adventure.

The product should never feel like a commercial.

---

## SET 3 (10–15s)

### Bigger Finale

The creator enters one final blockbuster environment that is even more spectacular than the previous two.

The action reaches its highest intensity.

Everything around the creator becomes even more chaotic.

Examples include:

- massive explosions
- dragons flying overhead
- giant creatures
- collapsing skyscrapers
- giant robots fighting
- space fleets
- impossible destruction
- fantasy armies
- meteor showers
- enormous waves
- volcanic eruptions

The creator continues surviving while naturally carrying or using the product.

The video ends in the middle of the action.

No explanation.

No recap.

No ending screen.

The adventure should feel like it continues after the video cuts.

---

# BLOCKBUSTER WORLDS

Each of the three sets should use completely different cinematic themes.

Possible worlds include:

- Medieval fantasy
- Alien invasion
- Dinosaur attack
- Giant robots
- Cyberpunk city
- Zombie apocalypse
- Pirate battle
- Underwater kingdom
- Frozen kingdom
- Jungle adventure
- Haunted castle
- Giant monster attack
- Space battle
- Ancient civilization
- Magical kingdom
- Post-apocalyptic wasteland
- Formula racing
- Street racing

Avoid repeating similar environments.

Every transition should feel surprising.

---

# RECURRING EASTER EGG (MANDATORY)

Every video must contain the same recurring easter egg: **a small white Pomeranian puppy.**

The Pomeranian is never the subject of the shot and must never become the visual focus of any scene.

The creator, the action, and the product must always remain the primary subjects.

The Pomeranian must always remain a subtle background detail that attentive viewers may discover while rewatching.

It must never appear in the center of the frame, never appear in the foreground, and never occupy a prominent position in the composition.

It should remain very small (less than approximately 2% of the visible frame), positioned near the edges of the frame or deep in the background, and be partially obscured by the environment whenever possible.

The camera must never intentionally frame, follow, reveal, zoom toward, or focus on the dog.

The Pomeranian must never interact with the creator or the product and must never influence the story in any way.

It may briefly appear during Set 1 or Set 2.

However, its primary appearance must always occur during Set 3, cleverly hidden somewhere inside the largest, busiest, and most chaotic environment.

Examples include:

- partially hidden behind rubble
- peeking behind a vehicle
- standing on a distant rooftop
- blending into a crowd
- hiding inside a window
- barely visible behind an explosion
- watching from a distant balcony
- hidden among background characters

Finding the hidden Pomeranian should feel like discovering a subtle detail in a blockbuster movie rather than something intentionally shown by the camera.

This recurring hidden character is one of the core identities of the series and should never be omitted.

---

# PRODUCT INTEGRATION

The product should never interrupt the story.

It should simply be something the creator naturally uses during the adventure.

The creator never explains the product.

Never lists features.

Never gives a sales pitch.

Never sounds like an advertisement.

The product simply becomes part of the creator's survival, comfort, or routine.

---

# CAMERA STYLE

The video should feel like one continuous handheld shot filmed by another person running alongside the creator.

Use:

- realistic handheld movement
- cinematic framing
- dynamic camera motion
- natural focus changes
- realistic lens behavior
- believable camera shake
- cinematic motion blur

The creator should remain visible during almost the entire video.

The camera should always prioritize the creator and the action. It should never intentionally compose a shot to highlight the hidden Pomeranian.

---

# DIALOGUE STYLE

Dialogue should be extremely minimal.

The visuals should tell almost the entire story.

The creator sounds calm, authentic, and conversational despite the chaos happening around them.

Never sound like an advertisement.

---

# FINAL GOAL

Create a **15-second hyperrealistic AI UGC video** that overwhelms viewers with nonstop blockbuster-level action while seamlessly integrating the product into the creator's adventure.

The primary retention hook is the constant visual spectacle.

The product should feel like a natural part of the creator's journey rather than the focus of the video.

The recurring hidden white Pomeranian should remain a subtle background easter egg that viewers naturally discover after multiple rewatches, never becoming the focus of the scene.`
  },
  {
    type: "aiGen",
    title: "Mall Hype Trend",
    description: "Busy shopping mall setting — viral trend discovery with crowd gathering around a product display.",
    content: `MALL HYPE TREND UGC

This video takes place inside a bustling modern shopping mall or high-end commercial center. The environment features soft, bright overhead lighting, clean polished floors, store facades in the background, and a realistic crowd of shoppers naturally moving around or gathering near the display area.

The creator is a relatable individual whose appearance, language, clothing style, and interaction with the surrounding environment naturally match the specified VIDEO LANGUAGE and target audience.

The video should feel like authentic, spontaneous social media content capturing a real-time trend rather than a commercial advertisement.

OUTPUT FORMAT (MANDATORY)

Output exactly:

[visual plan]:
visual description

[dialogue]:
dialogue only

Do not add any other sections.
Do not add titles.
Do not add explanations.
Do not add notes.
Do not add comments.

VISUAL PLAN

The visual plan must be written entirely in English.

The dialogue must never appear inside the visual plan.

The visual plan should describe only visible actions and camera behavior.

Describe:

camera framing (primarily selfie-style, talking head, and over-the-shoulder views)

camera movement (realistic handheld smartphone movement, natural panning to show surroundings)

environment (mall interior, background crowd movement, shop displays)

creator movement, facial expressions, and natural gestures

product positioning

product handling

transitions between shots

Do NOT describe:

emotions

viewer reactions

marketing intentions

product benefits

product claims

The creator must remain the primary visual focus throughout the entire video.
The commercial indoor environment should remain visually consistent.
Use realistic handheld smartphone camera movement with natural, un-stabilized framing to mimic viral social media discovery videos.

The visual flow should follow:

Creator speaking directly to camera in selfie framing inside a busy shopping mall hallway

Handheld camera pans slightly over the creator's shoulder to reveal a crowd of people gathered around a product display station in the background

Creator brings the product into the close-up frame, handling it naturally while shoppers move behind them

Creator looks back into the lens, pointing directly down towards the lower left corner of the screen

Creator finishes speaking directly to the camera, holding the product clearly in hand with the active mall environment visible in the background

DIALOGUE

The dialogue must be written entirely in VIDEO LANGUAGE.

The dialogue structure must strictly follow:

Comment on how incredibly popular this product is right now, mentioning how much people love it or how everyone is trying to get it.

State that the best part of all is that the viewer can buy it directly right here.

Highlight that it is currently available at an amazing or unbeatable price.

The creator should sound like a real person casually sharing a viral real-world trend or an exciting shopping discovery with a friend.

The tone should be:

natural

conversational

authentic

believable

Avoid:

aggressive corporate sales language

unrealistic product performance claims

obvious television advertising language

direct sales pressure`
  },
  {
    type: "aiGen",
    title: "Spouse Discount Regret",
    description: "Attractive woman annoyed her husband bought the product at full price when it's now heavily discounted.",
    content: `SPOUSE DISCOUNT REGRET UGC

This video takes place inside a beautiful modern home or apartment with premium contemporary interior design, comfortable furniture, and warm natural lighting.

The creator is an attractive woman whose appearance, language, clothing style, and environment naturally match the specified VIDEO LANGUAGE and target audience.

The video should feel like authentic social media content rather than a commercial advertisement.

OUTPUT FORMAT (MANDATORY)

Output exactly:

[visual plan]:
visual description

[dialogue]:
dialogue only

Do not add any other sections.
Do not add titles.
Do not add explanations.
Do not add notes.
Do not add comments.

VISUAL PLAN

The visual plan must be written entirely in English.

The dialogue must never appear inside the visual plan.

The visual plan should describe only visible actions and camera behavior.

Describe:

* camera framing (primarily talking head, medium close-ups, and product close-ups)
* camera movement (realistic handheld or lightly stabilized movement)
* environment
* creator movement, facial expressions (frowning, looking annoyed, shaking head), and gestures
* product positioning
* product handling
* transitions between shots

Do NOT describe:

* emotions
* viewer reactions
* marketing intentions
* product benefits
* product claims

The creator must remain the primary visual focus throughout the entire video.
The home environment should remain visually consistent.
Use realistic handheld smartphone camera movement with natural, believable framing.

The visual flow should follow:

1. Creator speaking directly to camera looking annoyed or shaking her head
2. Creator brings the product into the frame near her face, pointing out key details
3. Close-up of the creator handling or demonstrating a specific high-quality feature of the product
4. Creator looks back into the camera, gesturing with her hands in disbelief or pointing downwards
5. Creator finishes speaking directly to the lens, holding the product next to her face

DIALOGUE

The dialogue must be written entirely in VIDEO LANGUAGE.

The dialogue structure must strictly follow:

1. State that she is angry or annoyed with her husband for buying this specific product.
2. Briefly describe the high-quality advantages or premium benefits of the product.
3. Reveal that the real reason she is angry is because her husband bought it at full price, and right now it has a massive discount.

The creator should sound like a real person sharing a relatable household story with a friend.

The tone should be:

* conversational
* authentic
* slightly irritated but relatable
* believable

Avoid:

* aggressive corporate sales language
* unrealistic product performance claims
* obvious television advertising language
* direct sales pressure`
  },
  {
    type: "aiGen",
    title: "Spouse Discount Regret (Blooper)",
    description: "Same as Spouse Discount Regret but opens with an accidental product drop blooper to grab attention in the first second.",
    content: `SPOUSE DISCOUNT REGRET UGC (BLOOPER HOOK)

This video takes place inside a beautiful modern home or apartment with premium contemporary interior design, comfortable furniture, and warm natural lighting.

The creator is an attractive woman whose appearance, language, clothing style, and environment naturally match the specified VIDEO LANGUAGE and target audience.

The video should feel like authentic social media content rather than a commercial advertisement.

OUTPUT FORMAT (MANDATORY)

Output exactly:

[visual plan]:
visual description

[dialogue]:
dialogue only

Do not add any other sections.
Do not add titles.
Do not add explanations.
Do not add notes.
Do not add comments.

VISUAL PLAN

The visual plan must be written entirely in English.

The dialogue must never appear inside the visual plan.

The visual plan should describe only visible actions and camera behavior.

Describe:

* camera framing (primarily talking head, medium close-ups, and product close-ups)
* camera movement (realistic handheld or lightly stabilized movement)
* environment
* creator movement, facial expressions (frowning, looking annoyed, shaking head), and gestures
* product positioning
* product handling
* transitions between shots
* natural sound cues when relevant

Do NOT describe:

* emotions
* viewer reactions
* marketing intentions
* product benefits
* product claims

The creator must remain the primary visual focus throughout the entire video.
The home environment should remain visually consistent.
Use realistic handheld smartphone camera movement with natural, believable framing.

The visual flow should follow:

1. Cold open (blooper): The recording is already in progress. The creator is already holding the product in front of the camera as if she is about to begin speaking, but she accidentally drops it out of her hands. The product falls naturally onto a hard surface. The impact produces a slightly exaggerated but believable "THUD" or "CLACK" sound effect to make the opening more attention-grabbing without feeling cartoonish. The creator briefly reacts naturally, and the video immediately hard cuts. This moment should feel like an authentic filming mistake captured before the real take and should last only about one second.
2. Hard cut to the actual commercial. The creator is now speaking directly to the camera, looking annoyed or shaking her head while holding the product normally.
3. Creator brings the product into the frame near her face, pointing out key details.
4. Close-up of the creator handling or demonstrating a specific high-quality feature of the product.
5. Creator looks back into the camera, gesturing with her hands in disbelief or pointing downwards.
6. Creator finishes speaking directly to the lens, holding the product next to her face.

The dropped product exists only as a humorous filming blooper to create an attention-grabbing opening. After the hard cut, the commercial proceeds normally with no reference to the drop. The blooper should not appear staged or intentional.

DIALOGUE

The dialogue must be written entirely in VIDEO LANGUAGE.

The dialogue begins only after the hard cut from the blooper.

The dialogue structure must strictly follow:

1. State that she is angry or annoyed with her husband for buying this specific product.
2. Briefly describe the high-quality advantages or premium benefits of the product.
3. Reveal that the real reason she is angry is because her husband bought it at full price, and right now it has a massive discount.

The creator should sound like a real person sharing a relatable household story with a friend.

The tone should be:

* conversational
* authentic
* slightly irritated but relatable
* believable

Avoid:

* aggressive corporate sales language
* unrealistic product performance claims
* obvious television advertising language
* direct sales pressure`
  },
  {
    type: "aiGen",
    title: "TikTok Shop Price Glitch",
    description: "Creator shocked by an impossibly good price — fast-paced, urgently drives viewer to cart link.",
    content: `TIKTOK SHOP PRICE GLITCH UGC

This video takes place inside a modern apartment bedroom or living room setup with a realistic lived-in atmosphere and natural indoor lighting.

The creator is a relatable individual whose appearance, language, clothing style, and environment naturally match the specified VIDEO LANGUAGE and target audience.

The video should feel like authentic, spontaneous social media content rather than a commercial advertisement.

OUTPUT FORMAT (MANDATORY)

Output exactly:

[visual plan]:
visual description

[dialogue]:
dialogue only

Do not add any other sections.
Do not add titles.
Do not add explanations.
Do not add notes.
Do not add comments.

VISUAL PLAN

The visual plan must be written entirely in English.

The dialogue must never appear inside the visual plan.

The visual plan should describe only visible actions and camera behavior.

Describe:

 * camera framing (primarily selfie-style, talking head, and tight close-ups)
 * camera movement (spontaneous handheld smartphone movement, quick pans)
 * environment
 * creator movement, wide-eyed facial expressions, and rapid hand gestures
 * product positioning
 * product handling
 * transitions between shots

Do NOT describe:

 * emotions
 * viewer reactions
 * marketing intentions
 * product benefits
 * product claims

The creator must remain the primary visual focus throughout the entire video.
The indoor environment should remain visually consistent.
Use realistic handheld smartphone camera movement with natural, imperfect framing.

The visual flow should follow:

 1. Creator speaking directly to camera in selfie framing with a shocked expression
 2. Creator brings the product into the frame, showing its finish or layout near their face
 3. Close-up of the creator handling or interacting with a specific high-quality feature of the product
 4. Creator looks back into the camera, pointing directly down towards the lower left corner of the screen
 5. Creator finishes speaking directly to the lens, holding the product next to their face

DIALOGUE

The dialogue must be written entirely in VIDEO LANGUAGE.

The dialogue structure must strictly follow:

 1. Ask if they already saw the price of this product, stating that something is strange or weird about it.
 2. Briefly describe one premium, high-quality feature or advantage of the product.
 3. Tell the viewer to check the shopping cart link immediately to see the unbelievable price before it changes.

The creator should sound like a real person sharing an urgent, accidental discovery with a friend.

The tone should be:

 * fast-paced
 * conversational
 * authentic
 * believable

Avoid:

 * aggressive corporate sales language
 * unrealistic product performance claims
 * obvious television advertising language
 * direct sales pressure`
  },
  // --- collage ---
  {
    type: "collage",
    title: "FOMO Limited-Time Event",
    description: "For flash sales and seasonal campaigns: Pattern Interrupt → Opportunity → Discovery → FOMO → Soft CTA.",
    content: `TIKTOK SHOP LIMITED-TIME EVENT TEMPLATE (FOMO VERSION)

PURPOSE

This template is designed specifically for TikTok Shop limited-time campaigns, flash sales, lowest-price events, and seasonal promotions.

The goal is NOT to aggressively sell the product.

The goal is to make viewers feel:

"If I'm already interested in this product, I'd rather buy it now than regret paying more later."

The promotion should feel like a helpful shopping tip from a friend, not an advertisement.

--------------------------------------------------
GENERAL DIALOGUE GUIDELINES
--------------------------------------------------

- Speak naturally like you're talking to a friend.
- Sound like you accidentally found a really good deal.
- Keep the excitement focused on the timing, not on exaggerated product claims.
- Avoid corporate marketing language.
- Avoid sounding like a salesperson.
- Never dump specifications.
- Every feature should immediately connect to a real-life benefit.
- Keep sentences short enough for natural speech.
- Leave room for pauses and conversational pacing.

--------------------------------------------------
NARRATIVE STRUCTURE
--------------------------------------------------

1. PATTERN INTERRUPT (Hook)

Objective:
Stop the scroll without mentioning the product immediately.

Examples of direction:
- Wait... don't buy it yet.
- Hold on...
- I almost paid full price for this.
- If you've been thinking about buying one...
- You might want to see today's price first.

The hook should create curiosity about the timing rather than the product itself.

--------------------------------------------------

2. THE OPPORTUNITY

Objective:
Reveal that something special is happening.

Focus on ideas like:
- Limited-time event
- Lowest price in a long time
- Unexpected discount
- Better timing than usual

The viewer should think:

"Oh... maybe today is actually the best time to buy."

--------------------------------------------------

3. THE DISCOVERY

Objective:
Introduce the product naturally.

Good transitions include:

"So I ended up getting this..."

"This is the one I chose."

"I was already planning to buy one anyway..."

"I finally decided to grab it."

Never sound like a product presentation.

--------------------------------------------------

4. FEATURES + REAL BENEFITS

Objective:
Mention only 1-2 important features.

Always explain WHY they matter.

Instead of:

"It has Feature X."

Say:

"Now I don't have to worry about..."

"It makes my daily routine much easier."

"It saves me so much time."

"It solved the exact problem I had."

Show practical improvements instead of listing specifications.

--------------------------------------------------

5. FOMO MOMENT

Objective:
Create urgency without sounding pushy.

Naturally communicate ideas like:

- The discount is only available during the event.
- The discounted quantity is limited.
- First come, first served.
- The price may go back up after the promotion.
- If I waited, I'd probably regret it.

The emotion should be:

"I don't need to buy today...

...but I'd hate paying more tomorrow."

--------------------------------------------------

6. SOFT CTA

Objective:
Guide the viewer naturally.

Examples of direction:

"I'm leaving the link below if you want to check today's price."

"If you've already been thinking about getting one, this is probably the best time."

"I'd at least check the product page before the event ends."

"See if the discount is still available."

Never pressure the viewer.

--------------------------------------------------
PSYCHOLOGICAL TRIGGERS
--------------------------------------------------

The script should naturally use these emotions:

- Fear of paying more later: "I'd rather buy it while it's discounted than regret it next week."
- Fear of missing limited stock: "It looks like they're only discounting a limited quantity."
- Loss aversion: "I wasn't planning to buy it today... but I'd regret missing the deal."
- Smart shopper identity: "If I already wanted it, buying it during the sale just makes more sense."
- Curiosity: "I checked the price out of curiosity... and ended up buying it."

--------------------------------------------------
COMPLIANCE REQUIREMENTS
--------------------------------------------------

Whenever mentioning discounts or promotions, naturally include the following ideas:

- Limited quantities available.
- First come, first served.
- Promotion only available during the campaign period.
- Check the product page for the latest discount information.

Never imply:

- Unlimited stock.
- Guaranteed availability.
- That everyone will receive the promotion.
- That the discount will last forever.

--------------------------------------------------
OUTPUT FORMAT
--------------------------------------------------

[hook]:
(Create curiosity around the timing without mentioning the product immediately.)

[opportunity]:
(Explain why today is different and why the promotion is worth noticing.)

[discovery]:
(Introduce the product naturally as something you were already interested in.)

[benefits]:
(Explain one or two features by focusing on the practical everyday benefits.)

[fomo]:
(Create urgency by mentioning the limited-time promotion, limited quantities, first-come-first-served availability, and the possibility that the price will increase after the event.)

[cta]:
(Encourage viewers to check today's price or visit the product page before the promotion ends, using a relaxed, conversational tone.)`
  },
  {
    type: "collage",
    title: "Basic Creator Script",
    description: "Standard conversational UGC: Hook → Problem → Discovery → Features → Included → CTA.",
    content: `AUDIO DIALOGUE TEMPLATE: CREATOR-DRIVEN STRUCTURE

This template defines the pacing, tone, dialogue style, and narrative flow exclusively for the audio script. The dialogue must feel like an authentic, realistic voice note or a native social media video, completely avoiding traditional commercial or overpolished sales language.

---

GENERAL DIALOGUE GUIDELINES

- Conversational Tone: Speak like a real person sharing a genuine discovery with a friend. Use casual transitions.
- No Feature Dumping: Avoid listing technical specifications flatly. Every feature must be tied to a practical benefit.
- Pacing & Breath: Keep sentences relatively short. Allow room for natural pauses, conversational inflections, and emphasis.
- Anti-Marketing: Avoid corporate clichés, pushy sales adjectives ("the absolute best", "revolutionary"), and exaggerated hype.

---

NARRATIVE STRUCTURE

1. Hook
- Objective: Capture attention within the first 3 seconds using a highly relatable, natural statement or a fascinating question.
- Rule: Do not state the product name here. Focus entirely on an immediate, scroll-stopping feeling, habit, or situation.

2. The Problem
- Objective: Dive into the specific frustration or pain point the user is experiencing.
- Rule: Make it feel personal. Use phrases that highlight everyday friction (e.g., "We've all been there...", "It honestly drives me crazy when...").

3. The Discovery (The Solution)
- Objective: Introduce the product naturally as the organic answer to the problem just mentioned.
- Rule: Frame it as a personal find or an accidental discovery, not a sponsored pitch (e.g., "So I finally tried this...", "Then I found this setup...").

4. Key Features & Benefits
- Objective: Explain why it works by highlighting 1 or 2 main features, immediately translating them into real-world results.
- Rule: Show, don't just tell. Connect the technical aspect directly to how it changes the daily experience (e.g., instead of "100% blackout material", use "it completely blocks out the heat so you stay freezing cold").

5. What's Included / The Offer
- Objective: Give clarity on exactly what the user gets or the immediate value pack they will receive.
- Rule: Keep it snappy and concise. No complex breakdowns, just a quick visual/functional summary of the package.

6. Call to Action (CTA)
- Objective: Direct the viewer smoothly to the next step without sounding desperate for a sale.
- Rule: Keep it casual, low-pressure, and conversational (e.g., "Check the link below if you want to grab one", "The link is right down here if you're curious").

---

OUTPUT FORMAT

[hook]: (Insert hook dialogue here...)

[problem]: (Insert problem dialogue here...)

[discovery]: (Insert discovery dialogue here...)

[features]: (Insert features dialogue here...)

[included]: (Insert what's included dialogue here...)

[cta]: (Insert call to action dialogue here...)`
  },
  {
    type: "collage",
    title: "Natural UGC Script (Chimo)",
    description: "20-second UGC: choose a sales angle first, then Hook → Problem → Discovery → Why It Works → Proof → Offer → CTA.",
    content: `# TIKTOK SHOP AUDIO SCRIPT TEMPLATE (NATURAL UGC)

## PURPOSE

Generate a high-converting TikTok Shop audio script that feels like authentic creator content rather than an advertisement.

The dialogue should sound spontaneous, personal, and conversational, as if someone is recommending a product they genuinely use and enjoy.

The script should naturally guide the viewer from curiosity to purchase without ever sounding like a traditional commercial.

The final script should be approximately 20 seconds long.

---

## GENERAL GUIDELINES

### Conversational First

Speak like a real person.

The dialogue should feel like:
- A voice message
- A FaceTime recommendation
- A casual TikTok story
- A friend sharing a useful discovery

Never sound like a company.

---

### Benefits Before Features

Never simply list product features.

Every feature must immediately explain:

Feature
→ Practical Benefit
→ Real-Life Result

Always answer: "So why should I care?"

---

### Natural Pacing

Use short sentences. Mix sentence lengths. Leave room for natural pauses. Avoid long paragraphs.

The script should feel easy to speak naturally.

---

### Authentic Language

Avoid words like: Revolutionary, Premium quality, Ultimate, Industry-leading, Best product ever, Game-changing

Instead use expressions such as:
- I honestly didn't expect...
- This actually surprised me...
- I finally found...
- I've been using this every day...
- It makes things so much easier...
- I wish I had bought this sooner...

---

## SALES ANGLE

Before writing the script, determine the strongest sales angle.

Choose ONE primary angle. Optional secondary angle.

Possible sales angles:

- Problem Solving
- Low Price
- Convenience
- Time Saving
- Lifestyle
- Transformation
- Comparison
- Safety
- Trust
- Trending Product
- Gift Idea
- Limited-Time Offer

The entire script should reinforce this angle consistently.

---

## SCRIPT STRUCTURE

### 1. Hook

Capture attention within the first 3 seconds.

- Do NOT mention the product immediately.
- Focus on curiosity, surprise, frustration, or a relatable situation.
- Make viewers instantly think: "That's me."

Possible hook styles: Question, Bold statement, Common mistake, Unexpected observation, Price shock, Lifestyle tease, Before vs After

---

### 2. Problem

Describe the everyday frustration. Make it personal. Avoid generic pain points. Use relatable language.

Examples:
- I was tired of...
- This always happened to me...
- It honestly drove me crazy...

---

### 3. Discovery

Introduce the product naturally. Present it as a personal discovery. Never sound sponsored.

Examples:
- Then I found this...
- So I finally decided to try it...
- Someone recommended this...

Introduce the product name here.

---

### 4. Why It Works

Explain why the product solves the problem. Choose only 1-3 key benefits.

For every feature: Feature → Practical Benefit → Real-Life Result

Show how it improves everyday life instead of describing technical specifications.

---

### 5. Proof / Demonstration

Build trust by showing the product working.

Possible approaches: Before vs After, Comparison, Personal experience, Daily routine, Time saved, Convenience, Safety, Visible results

Avoid unrealistic or exaggerated claims.

---

### 6. What's Included

Clearly explain what the buyer receives. Keep it short.

Mention only relevant items: Product quantity, Accessories, Bundle, Available colors, Discount, Limited offer

---

### 7. Call To Action

Guide the viewer toward purchasing naturally. Keep it casual. Never sound desperate.

Examples:
- The link's right below if you want one.
- Check it out if you're curious.
- I left it in the orange cart.
- Grab yours while it's still available.

---

## OUTPUT FORMAT

Primary Sales Angle:

Secondary Sales Angle (Optional):

[hook]: ...

[problem]: ...

[discovery]: ...

[why_it_works]: ...

[proof]: ...

[included]: ...

[cta]: ...`
  },
  {
    type: "collage",
    title: "Guilt (Protective Instinct)",
    description: "Activates viewer's protective instinct by revealing a hidden risk, then introduces the product as the responsible solution.",
    content: `GUILT (Protective Instinct) AUDIO DIALOGUE TEMPLATE

This template is designed to activate the viewer's protective instinct by making them realize a real risk or long-term consequence they may have overlooked. The emotion is not fear for the sake of fear—it is responsibility. The script should make the viewer think:

"I didn't know this... I should probably fix it."

The guilt must always be based on truthful, verifiable information. Never invent health risks, exaggerate consequences, or make unsupported medical claims.

---

GENERAL DIALOGUE GUIDELINES

- Conversational and natural. Speak like you're sharing an important discovery with a friend.
- Sound concerned, not judgmental.
- The goal is to raise awareness first, then introduce the product as the responsible solution.
- Never shame the viewer or make them feel like a bad parent, partner, or person.
- Every statement about risks or health must be truthful and supported by reliable information.
- Avoid corporate language, exaggerated hype, or obvious sales talk.

---

NARRATIVE STRUCTURE

1. Awareness Hook

Objective:
Capture attention within the first few seconds by revealing a surprising fact or asking a question that exposes a hidden risk.

Rules:
- Do not mention the product yet.
- Focus entirely on the overlooked danger or habit.
- Make the viewer immediately question their current behavior.

Examples:
"Did you know this could actually be harming your family?"
"I wish someone had told me this sooner."
"Most people have no idea they're doing this every single day."

---

2. The Hidden Risk

Objective:
Explain the overlooked problem in simple, relatable language.

Rules:
- Only mention risks that are truthful and supported by evidence.
- Explain why the common habit may not be the best choice.
- Make it personal and easy to understand.

Examples:
"I had no idea that every time you cut food on certain plastic cutting boards, tiny plastic particles can wear off over time."
"I never realized carrying a heavy bag on one shoulder all day can put uneven strain on your back."

The viewer should think: "Wait... I do that."

---

3. Emotional Realization

Objective:
Create a feeling of personal responsibility without attacking the viewer.

Rules:
- Focus on protecting yourself or the people you care about.
- Show the creator's own emotional reaction.
- Avoid manipulation or guilt-tripping.

Examples:
"When I found out, I honestly felt guilty."
"It made me think about what my family is exposed to every day."
"It wasn't worth saving a few dollars anymore."

The emotion should be: "I should have known." Not: "I'm a terrible parent."

---

4. Discovery (The Responsible Solution)

Objective:
Introduce the product naturally as the better alternative.

Rules:
- Present it as something you discovered while looking for a safer or smarter option.
- Keep the tone personal and authentic.

Examples:
"So I started looking for a better option..."
"That's when I found this..."
"I decided to switch to this instead."

---

5. Features & Benefits

Objective:
Explain why the product solves the original concern.

Rules:
- Every feature must immediately translate into a real-life benefit.
- Focus on peace of mind instead of technical specifications.
- Show how it improves everyday life.

Bad: "It's made from acacia wood."
Better: "Since it's made from natural acacia wood, I don't have to worry about cutting directly on plastic every day."

---

6. What's Included / The Offer

Objective:
Clearly explain what the buyer receives and why now is a good time to buy.

Rules:
- Mention what is included.
- Mention the original price.
- Mention the current discounted price.
- Keep it short and easy to visualize.

Example:
"It normally costs $59, but right now it's only $34, and it comes with..."

---

7. Protective Call to Action (CTA)

Objective:
Encourage action by reinforcing responsibility rather than creating pressure.

Rules:
- Keep it casual and conversational.
- If they can't buy today, encourage them to save the video.
- Invite comments naturally.

Examples:
"If you can't grab one today, at least save this video so you remember later."
"The link is right below if you want to check it out."
"And if you end up getting one, let me know in the comments."

---

PSYCHOLOGICAL TRIGGERS

The script should naturally activate one or more of these emotions:

- Protecting loved ones
- Being a responsible parent
- Being a caring partner
- Protecting your own health
- Avoiding future regret
- Preventing problems before they happen
- Peace of mind
- Making a smarter long-term decision

The viewer should finish the video thinking: "I didn't know that." followed by "I should probably do something about it."

---

OUTPUT FORMAT

[hook]:
(Attention-grabbing question or statement that reveals a hidden truth.)

[risk]:
(Explain the overlooked problem or habit using truthful information.)

[realization]:
(The creator realizes the risk and feels responsible for making a change.)

[discovery]:
(Introduce the product as the better alternative.)

[features]:
(Show 1-3 key features and immediately connect each one to a real-life benefit or peace of mind.)

[offer]:
(Mention what's included, original price, current discounted price, and any limited-time offer.)

[cta]:
(Encourage viewers to check the link. If they can't buy now, suggest saving the video for later. Invite them to leave a comment if they purchased it.)`
  },
  {
    type: "collage",
    title: "Pattern Interrupt (Secret Hook)",
    description: "High-conversion: opens by challenging a common belief, reveals the product as the cheat code.",
    content: `AUDIO DIALOGUE TEMPLATE: THE PATTERN INTERRUPT (HIGH CONVERSION)

This template leverages psychological curiosity and pattern interruption. Instead of starting with a standard problem, it starts by challenging a common belief or habit, making the viewer stop scrolling immediately. The tone is authoritative yet casual, like a friend revealing a secret hack.

---

GENERAL DIALOGUE GUIDELINES

- High Energy / Confident Tone: Speak with total conviction, as if you discovered a massive shortcut or a hidden truth.
- Pattern Interrupt: The first sentence must completely clash with what the viewer expects to hear.
- Benefit over Feature: Never describe the product's physics; describe the exact lifestyle upgrade or relief it provides.
- No Fluff: Every sentence must move the narrative forward. Keep it tight.

---

NARRATIVE STRUCTURE

1. The Pattern Interrupt (The Hook)
- Objective: Stop the scroll by making a bold, counter-intuitive statement or calling out a common mistake.
- Rule: Do not say the product name. Say something that contradicts normal behavior (e.g., "Stop wasting your money on...", "Most people think they need X to solve Y, but they are completely wrong...").

2. The Agitation (Why they are struggling)
- Objective: Explain why their current method is failing them, triggering an emotional "aha!" moment.
- Rule: Expose the hidden friction they experience daily without realizing it (e.g., "That's why you're always feeling exhausted/sweaty/unorganized, no matter how hard you try").

3. The Paradigm Shift (The Discovery)
- Objective: Introduce your product not as "a tool", but as the hidden alternative or "the cheat code" that fixed everything.
- Rule: Frame it as a game-changer that simplified your life (e.g., "I threw all of that away when I found this instead...").

4. The Core Transformation (The Secret Feature)
- Objective: Highlight the single most powerful result of using the product, focusing on extreme convenience or physical relief.
- Rule: Contrast the "Before" vs the "After" immediately (e.g., "Instead of carrying three different things, this single setup does everything while keeping me completely freezing cold").

5. Social Proof / Mind Easer
- Objective: Remove skepticism immediately by showing how easy it is to adopt or how others are losing their minds over it.
- Rule: Keep it short (e.g., "There's a reason why this specific setup keeps selling out every time it's restocked").

6. Low-Pressure Call to Action (CTA)
- Objective: Drive action by making them feel they are missing out on an advantage if they don't check it out right now.
- Rule: Focus on the link availability (e.g., "If you want to skip the headache, the direct link is right down here in the corner").

---

OUTPUT FORMAT

[hook]: (Insert pattern interrupt hook dialogue here...)

[agitation]: (Insert agitation dialogue here...)

[discovery]: (Insert paradigm shift dialogue here...)

[transformation]: (Insert core transformation dialogue here...)

[proof]: (Insert social proof dialogue here...)

[cta]: (Insert low-pressure call to action dialogue here...)`
  },
  {
    type: "collage",
    title: "Taku-Takkun Creator Script",
    description: "High-energy Japanese-style UGC: Instant Hook → Proof → Problem → Discovery → Value → Social Trust → Offer → CTA.",
    content: `TAKU-TAKKUN CREATOR SCRIPT TEMPLATE

This template defines the pacing, energy, dialogue style, psychological triggers, and conversion flow used in high-performing Japanese short-form e-commerce videos inspired by Taku-Takkun.

The dialogue must feel like a creator enthusiastically sharing an incredible discovery with their audience, never like a traditional advertisement. Every sentence should either create curiosity, build trust, demonstrate value, or move the viewer one step closer to purchasing.

--------------------------------------------------
GENERAL DIALOGUE GUIDELINES
--------------------------------------------------

- Creator-Driven Voice: Speak like a real creator who genuinely discovered an amazing product and can't wait to show it.
- High Energy: Maintain fast pacing with natural enthusiasm, but avoid sounding forced or theatrical.
- Conversational Flow: The dialogue should feel spontaneous, as if filmed in one take for social media.
- Show, Don't Sell: Every claim should be backed by something the viewer can immediately see or understand.
- Benefit Before Specs: Technical specifications should only appear if they are immediately translated into practical daily benefits.
- Short Punchy Sentences: Keep sentences concise to match fast-paced editing.
- Momentum: Every sentence should naturally push the story forward.
- Authenticity: Avoid corporate language, exaggerated marketing buzzwords, and generic advertising clichés.
- Visual-First Writing: Write dialogue that naturally encourages visual demonstrations rather than long explanations.

--------------------------------------------------
NARRATIVE STRUCTURE
--------------------------------------------------

1. Instant Impact Hook

Objective: Immediately stop the viewer from scrolling.

Possible hook approaches:
- Shocking price
- Unexpected fact
- Hidden problem
- Huge improvement
- Exclusive collaboration
- Crazy comparison
- "I can't believe this..." moment

Rules:
- Grab attention within the first 2-3 seconds.
- Create curiosity before giving explanations.
- Avoid introducing too much information.
- Make the audience immediately want proof.

Examples:
"This is WAY cheaper than I expected."
"Wait... this only costs..."
"I had no idea this even existed."
"You're seriously telling me this is real?"

--------------------------------------------------

2. Instant Proof

Objective: Immediately validate the hook through visual evidence.

Instead of talking about the product, demonstrate it.

Possible demonstrations:
- Stress test
- Durability test
- Shake test
- Waterproof test
- Macro close-up
- Fingerprint detail
- Before & After
- One-touch mechanism
- Speed comparison
- Sound demonstration
- Texture demonstration
- Setup demonstration

Rules: The viewer should instantly think: "Okay... that's actually impressive."

--------------------------------------------------

3. Problem

Objective: Introduce a relatable frustration or inconvenience.

Rules:
- Make it feel personal.
- Use everyday situations.
- Avoid sounding scripted.

Examples:
"I was getting tired of..."
"This kept happening to me..."
"It honestly became annoying..."
"I finally got tired of dealing with this."

--------------------------------------------------

4. Discovery (Solution)

Objective: Introduce the product naturally as the solution.

Rules:
- Never sound sponsored.
- Make it feel like a personal recommendation.
- Present it as something you discovered yourself.

Examples:
"So I finally tried this..."
"I ended up finding this..."
"This completely solved it."
"I honestly wish I'd found this sooner."

--------------------------------------------------

5. Value Layer (Features + Benefits)

Objective: Explain why the product works.

Every specification must answer: "So what?"

Example:
Instead of "It has 45W charging."
Say "It has 45W charging, so I can recover around 60% battery during a short break."

Instead of "It's made from 316 stainless steel."
Say "So it doesn't keep coffee smells or metallic taste."

Rules:
- Never dump specifications.
- Every feature must immediately become a practical benefit.
- Choose only the most important 1-3 features.

--------------------------------------------------

6. Social Trust

Objective: Build credibility through authentic personal experience.

Possible methods:
- Repeat purchase
- Daily routine
- Family usage
- Work usage
- Comparison against cheap alternatives
- Warning about fake products
- Recommendation to a specific type of person

Rules: The creator should feel like someone helping the viewer make a smart decision, not trying to make a sale.

--------------------------------------------------

7. Complete Offer

Objective: Clearly communicate everything included.

Possible information:
- Accessories
- Included items
- Color options
- Size options
- Packaging
- Premium materials
- Country of origin
- Bonus items

Rules: Keep this section concise. The viewer should clearly understand what they're receiving.

--------------------------------------------------

8. Soft Call To Action

Objective: Naturally guide the viewer toward purchasing.

Rules:
- Never sound desperate.
- Never pressure the audience.
- Encourage curiosity instead of urgency.

Examples:
"Check the link below if you're interested."
"It's linked right here."
"Take a look if you're curious."
"You can find everything on the product page."

--------------------------------------------------
CONVERSION FLOW
--------------------------------------------------

HOOK → Why should I stop scrolling?
PROOF → Can it actually do that?
PROBLEM → Why do I need this?
SOLUTION → How does this fix my problem?
VALUE → Why is it actually good?
TRUST → Can I believe this creator?
OFFER → What exactly am I getting?
CTA → Where can I buy it?

--------------------------------------------------
OUTPUT FORMAT
--------------------------------------------------

[hook]: (Scroll-stopping opening)

[proof]: (Immediate visual validation)

[problem]: (Relatable frustration)

[discovery]: (Natural product introduction)

[value]: (Features immediately translated into real-world benefits)

[social]: (Personal experience, repeat purchase, recommendation, or credibility)

[offer]: (Everything included, accessories, options, packaging)

[cta]: (Casual invitation to purchase)

--------------------------------------------------
FINAL WRITING RULES
--------------------------------------------------

- The first three seconds should immediately create curiosity.
- Demonstrate before explaining.
- Every feature must become a benefit.
- Keep the dialogue constantly moving forward.
- Remove filler words and unnecessary repetition.
- Write for short-form videos between 15 and 30 seconds.
- Every sentence should either increase curiosity, build trust, or move the viewer closer to purchase.
- The audience should feel like they're watching a genuine creator sharing an incredible find, not a commercial.`
  },
  // --- voice ---
  {
    type: "voice",
    title: "Announcer",
    description: "Deep, authoritative announcer voice. Great for dramatic hooks and epic product reveals.",
    voiceId: "gU0LNdkMOQCOrPrwtbee"
  },
  {
    type: "voice",
    title: "Heavy",
    description: "Heavy, intense voice with strong presence. Ideal for high-energy or serious content.",
    voiceId: "YOq2y2Up4RgXP2HyXjE5"
  },
  {
    type: "voice",
    title: "Cute",
    description: "Light, cute and friendly voice. Works well for lifestyle, kawaii, or casual product videos.",
    voiceId: "B8gJV1IhpuegLxdpXFOE"
  },
  {
    type: "voice",
    title: "Woman",
    description: "Natural female voice, conversational tone. Versatile for UGC-style videos.",
    voiceId: "eR40ATw9ArzDf9h3v7t7"
  },
  {
    type: "voice",
    title: "Karen",
    description: "Confident, expressive female voice. Great for relatable complaint or discount-regret narratives.",
    voiceId: "qXpMhyvQqiRxWQs4qSSB"
  }
];

// Documentos guardados en Firestore antes de la migración a `videos[]` todavía tienen el
// campo viejo `bRolls[]` (sin section/source/trim). Se normalizan al leerlos para no romper la UI.
function normalizeProduct(raw: any): Product {
  if (raw.videos) return raw as Product;

  const legacyBRolls = raw.bRolls || [];
  const videos: ProductVideo[] = legacyBRolls.map((b: any) => ({
    id: b.id,
    name: b.name,
    downloadUrl: b.downloadUrl,
    duration: b.duration,
    section: b.section || 'General',
    source: b.source || 'recorded',
    trimStart: b.trimStart ?? 0,
    trimEnd: b.trimEnd ?? b.duration,
    ...(b.storagePath && { storagePath: b.storagePath }),
    createdAt: b.createdAt
  }));

  return { ...raw, videos } as Product;
}

// Old types: 'script' → 'collage', 'ai_prompt' → 'aiGen'. 'voice' stays 'voice'. Docs without type default to 'collage'.
function normalizeTemplate(raw: any): Template {
  const typeMap: Record<string, TemplateType> = {
    script: 'collage',
    ai_prompt: 'aiGen',
    aiGen: 'aiGen',
    collage: 'collage',
    voice: 'voice',
    overlay: 'overlay',
  };
  const type: TemplateType = typeMap[raw.type] ?? 'collage';
  return { ...raw, type } as Template;
}

const TTCHOP_SERVER_URL = 'https://ttchop-server.lemonsushi.com';

function getAppMode(): 'prod' | 'test' | 'server' {
  const m = localStorage.getItem('ttchop_mode');
  if (m === 'prod' || m === 'test' || m === 'server') return m;
  return localStorage.getItem('ttchop_test_mode') === 'true' ? 'test' : 'prod';
}

function resolveWebhookUrl(n8nProdName: string, serverPath: string): string {
  const mode = getAppMode();
  if (mode === 'server') return TTCHOP_SERVER_URL + serverPath;
  const base = 'https://flows.lemonsushi.com';
  return mode === 'test' ? `${base}/webhook-test/${n8nProdName}` : `${base}/webhook/${n8nProdName}`;
}

class DatabaseService {
  private seededUsers = new Set<string>(); // Track which users have been seeded in this session
  private seedingPromises = new Map<string, Promise<void>>(); // De-dupe concurrent seed calls (e.g. React StrictMode double-invoke)

  // Seed initial template data if the user has no templates
  async seedUserDatabase(uid: string): Promise<void> {
    const inFlight = this.seedingPromises.get(uid);
    if (inFlight) return inFlight;

    const promise = this.seedUserDatabaseInner(uid).finally(() => {
      this.seedingPromises.delete(uid);
    });
    this.seedingPromises.set(uid, promise);
    return promise;
  }

  async forceReseedTemplates(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");
    const q = query(collection(firestore, 'templates'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    const batch = writeBatch(firestore);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    localStorage.removeItem(`ttchop_seeded_${user.uid}`);
    this.seededUsers.delete(user.uid);
    await this.seedUserDatabaseInner(user.uid);
  }

  private async seedUserDatabaseInner(uid: string): Promise<void> {
    // Check if already seeded in this session
    if (this.seededUsers.has(uid)) return;

    const seededKey = `ttchop_seeded_${uid}`;

    // Check if already seeded in localStorage (survives page reloads)
    if (localStorage.getItem(seededKey)) {
      this.seededUsers.add(uid);
      return;
    }

    const q = query(collection(firestore, 'templates'), where('userId', '==', uid));
    const snap = await getDocs(q);

    if (!snap.empty) {
      this.seededUsers.add(uid);
      localStorage.setItem(seededKey, 'true');
      return;
    }

    console.log("Seeding empty database for user: ", uid);

    // Seed templates
    for (const t of SEED_TEMPLATES) {
      const tempId = `temp_${Math.random().toString(36).substring(2, 9)}`;
      await setDoc(doc(firestore, 'templates', tempId), {
        ...t,
        id: tempId,
        userId: uid,
        createdAt: new Date().toISOString()
      });
    }

    // Mark user as seeded
    this.seededUsers.add(uid);
    localStorage.setItem(seededKey, 'true');
  }

  // --- PRODUCTS ---
  async getProducts(): Promise<Product[]> {
    const user = auth.currentUser;
    if (!user) return [];

    // Seed database if empty
    await this.seedUserDatabase(user.uid);

    const q = query(
      collection(firestore, 'products'),
      where('userId', '==', user.uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => normalizeProduct(doc.data()));
  }

  async saveProduct(product: Omit<Product, 'id' | 'userId' | 'createdAt'>): Promise<Product> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const prodId = `prod_${Math.random().toString(36).substring(2, 9)}`;

    const newProduct: Product = {
      id: prodId,
      userId: user.uid,
      name: product.name,
      description: product.description,
      modelSheetUrls: product.modelSheetUrls,
      videos: product.videos.map(video => ({
        ...video,
        id: `vid_${Math.random().toString(36).substring(2, 9)}`,
        createdAt: new Date().toISOString()
      })),
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(firestore, 'products', prodId), newProduct);
    return newProduct;
  }

  async updateProduct(productId: string, updates: Partial<Omit<Product, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const docRef = doc(firestore, 'products', productId);
    await updateDoc(docRef, updates);
  }

  async deleteProduct(productId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    // Unlink this product from any sessions that reference it — sessions are never deleted here
    const linkedQ = query(
      collection(firestore, 'sessions'),
      where('userId', '==', user.uid),
      where('productIds', 'array-contains', productId)
    );
    const linkedSnap = await getDocs(linkedQ);
    await Promise.all(
      linkedSnap.docs.map(d => updateDoc(d.ref, { productIds: arrayRemove(productId) }))
    );

    const docRef = doc(firestore, 'products', productId);
    await deleteDoc(docRef);
  }

  // --- SESSIONS ---
  async getSessions(): Promise<Session[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const q = query(collection(firestore, 'sessions'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Session);
  }

  async getSessionsForProduct(productId: string): Promise<Session[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const q = query(
      collection(firestore, 'sessions'),
      where('userId', '==', user.uid),
      where('productIds', 'array-contains', productId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Session);
  }

  async saveSession(name: string, productIds: string[]): Promise<Session> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const sessionId = `sess_${Math.random().toString(36).substring(2, 9)}`;
    const newSession: Session = {
      id: sessionId,
      userId: user.uid,
      name,
      productIds,
      videos: [],
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(firestore, 'sessions', sessionId), newSession);
    return newSession;
  }

  async updateSession(sessionId: string, updates: Partial<Omit<Session, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const docRef = doc(firestore, 'sessions', sessionId);
    await updateDoc(docRef, updates);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    // Delete all videos from Cloud Storage
    const storageRef = ref(storage, `users/${user.uid}/sessions/${sessionId}`);
    try {
      const items = await listAll(storageRef);
      const allPromises: Promise<void>[] = [];

      items.items.forEach(file => {
        allPromises.push(deleteObject(file));
      });

      items.prefixes.forEach(prefix => {
        allPromises.push(this.deleteStorageDirectory(prefix));
      });

      await Promise.all(allPromises);
    } catch (err: any) {
      // Directory might not exist, continue with Firestore deletion
    }

    // Delete session document
    const docRef = doc(firestore, 'sessions', sessionId);
    await deleteDoc(docRef);
  }

  private async deleteStorageDirectory(dirRef: any): Promise<void> {
    try {
      const items = await listAll(dirRef);
      const allPromises: Promise<void>[] = [];

      items.items.forEach(file => {
        allPromises.push(deleteObject(file));
      });

      items.prefixes.forEach(prefix => {
        allPromises.push(this.deleteStorageDirectory(prefix));
      });

      await Promise.all(allPromises);
    } catch (err: any) {
      // Directory might not exist
    }
  }

  async uploadSessionVideoFile(sessionId: string, file: File | Blob, name?: string, onProgress?: (pct: number) => void): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const fileName = name ?? (file instanceof File ? file.name : `video_${Date.now()}.mp4`);
    const path = `users/${user.uid}/sessions/${sessionId}/videos/${Date.now()}_${fileName}`;
    const fileRef = ref(storage, path);

    if (onProgress) {
      return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(fileRef, file);

        // Stall detector: if progress doesn't advance for 30s, cancel and let caller retry
        let lastBytes = 0;
        let lastAdvance = Date.now();
        const stallTimer = setInterval(() => {
          const current = task.snapshot.bytesTransferred;
          if (current > lastBytes) { lastBytes = current; lastAdvance = Date.now(); }
          else if (Date.now() - lastAdvance > 30_000) {
            clearInterval(stallTimer);
            task.cancel();
            reject(new Error('upload_stalled'));
          }
        }, 5_000);

        task.on('state_changed',
          snap => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          err => { clearInterval(stallTimer); reject(err); },
          () => { clearInterval(stallTimer); getDownloadURL(task.snapshot.ref).then(resolve).catch(reject); }
        );
      });
    }

    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  }

  async uploadSessionThumbnail(sessionId: string, blob: Blob): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const path = `users/${user.uid}/sessions/${sessionId}/thumbnails/${Date.now()}_thumb.jpg`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob);
    return getDownloadURL(fileRef);
  }

  // --- TEMPLATES ---
  async getTemplates(): Promise<Template[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const q = query(
      collection(firestore, 'templates'),
      where('userId', '==', user.uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => normalizeTemplate(doc.data()));
  }

  async getTemplatesByType(type: TemplateType): Promise<Template[]> {
    const templates = await this.getTemplates();
    return templates.filter(t => t.type === type);
  }

  async saveTemplate(template: Omit<Template, 'id' | 'userId' | 'createdAt'>): Promise<Template> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const tempId = `temp_${Math.random().toString(36).substring(2, 9)}`;

    const newTemplate: Template = {
      id: tempId,
      userId: user.uid,
      type: template.type,
      title: template.title,
      description: template.description,
      ...(template.content && { content: template.content }),
      ...(template.voiceId && { voiceId: template.voiceId }),
      ...(template.referenceVideoUrl && { referenceVideoUrl: template.referenceVideoUrl }),
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(firestore, 'templates', tempId), newTemplate);
    return newTemplate;
  }

  async updateTemplate(templateId: string, updates: Partial<Omit<Template, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const docRef = doc(firestore, 'templates', templateId);
    await updateDoc(docRef, updates);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const docRef = doc(firestore, 'templates', templateId);
    await deleteDoc(docRef);
  }

  // --- MASTER VIDEOS ---
  async getMasterVideos(): Promise<MasterVideo[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const q = query(
      collection(firestore, 'master_videos'),
      where('userId', '==', user.uid)
    );
    const snap = await getDocs(q);
    
    // Sort in client side by date desc to avoid configuring firestore indexes for the MVP
    return (snap.docs.map(doc => doc.data() as MasterVideo))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getMasterVideoById(id: string): Promise<MasterVideo | undefined> {
    const docRef = doc(firestore, 'master_videos', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as MasterVideo;
    }
    return undefined;
  }

  async deleteAllMasterVideos(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const q = query(
      collection(firestore, 'master_videos'),
      where('userId', '==', user.uid)
    );
    const snap = await getDocs(q);

    const batch = writeBatch(firestore);
    snap.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();
  }

  async updateMasterVideo(masterId: string, updates: Partial<Omit<MasterVideo, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const docRef = doc(firestore, 'master_videos', masterId);
    await updateDoc(docRef, updates);
  }

  async generatePromptFromWebhook(
    productId: string,
    templateId: string,
    extraNotes: string,
    language: string,
    onProgress: (status: string) => void
  ): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const products = await this.getProducts();
    const templates = await this.getTemplates();
    const product = products.find(p => p.id === productId);
    const template = templates.find(t => t.id === templateId);

    if (!product || !template) {
      throw new Error("Product or Template not found.");
    }

    onProgress("Contacting n8n webhook to generate prompt...");

    // Determine the webhook based on TEST/PRODUCTION mode
    const webhookUrl = resolveWebhookUrl('ttchop_aiGen_prompt', '/ai/prompt');

    const payload = {
      productDescription: product.description,
      aiTemplate: {
        id: template.id,
        title: template.title,
        content: template.content || ''
      },
      language,
      extraNotes
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with status ${response.status}`);
      }

      const data = await response.json();

      // Extract the prompt from the array returned by n8n
      if (Array.isArray(data) && data.length > 0) {
        return data[0].output || '';
      }

      return data.prompt || data.scriptText || data.output || '';
    } catch (error) {
      console.error('Webhook error:', error);
      throw error;
    }
  }

  async createMasterVideoFromWebhook(
    productId: string,
    templateId: string,
    extraNotes: string,
    language: string,
    finalPrompt: string,
    videoProvider: string,
    onProgress: (status: string) => void
  ): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const products = await this.getProducts();
    const templates = await this.getTemplates();
    const product = products.find(p => p.id === productId);
    const template = templates.find(t => t.id === templateId);

    if (!product || !template) {
      throw new Error("Product or Template not found.");
    }

    onProgress("Sending video for generation...");

    const webhookUrl = resolveWebhookUrl('ttchop_aiGen_videoGen', '/ai/generate');

    const payload = getAppMode() === 'server'
      ? {
          prompt: finalPrompt,
          imageUrls: product.modelSheetUrls,
          model: videoProvider.toLowerCase() === 'veo3' ? 'veo3' : 'seedance',
          aspectRatio: '9:16',
        }
      : {
          prompt: finalPrompt,
          productImages: product.modelSheetUrls,
          templateReferenceVideo: template.referenceVideoUrl || '',
          language,
          extraNotes,
          videoProvider,
        };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        if (getAppMode() === 'server') {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Webhook responded with status ${response.status}`);
        }
        throw new Error(`Webhook responded with status ${response.status}`);
      }

      const data = await response.json();

      // Check for an error in the response
      if (Array.isArray(data) && data.length > 0 && data[0].error) {
        throw new Error(`Webhook error: ${data[0].error}`);
      }

      onProgress("Creating render entry...");

      const item = Array.isArray(data) ? data[0] : data;
      const taskId: string = item?.data?.taskId || item?.data?.recordId || item?.taskId || `render_${Date.now()}`;

      const productName = product.name;
      await this.createRender({
        type: 'ai',
        status: 'pending',
        productId,
        productName,
      }, taskId);

      onProgress("Sent! Tracking in Renders.");
      return taskId;
    } catch (error) {
      console.error('Webhook error:', error);
      throw error;
    }
  }

  // --- VARIATIONS ---
  async getVariations(): Promise<VideoVariation[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const q = query(
      collection(firestore, 'video_variations'),
      where('userId', '==', user.uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as VideoVariation);
  }

  async getVariationsForMaster(masterVideoId: string): Promise<VideoVariation[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const q = query(
      collection(firestore, 'video_variations'),
      where('masterVideoId', '==', masterVideoId),
      where('userId', '==', user.uid)
    );
    const snap = await getDocs(q);
    return (snap.docs.map(doc => doc.data() as VideoVariation))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async startVariationGeneration(
    masterVideoId: string,
    productId: string,
    bRollCombination: string[],
    onProgress: (status: string) => void,
    customVideoUrl?: string,
    _voiceId?: string
  ): Promise<VideoVariation> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const master = await this.getMasterVideoById(masterVideoId);
    if (!master) {
      throw new Error("Master video not found.");
    }

    // Use custom video URL if provided, otherwise use B-roll combination
    const baseVideoUrl = customVideoUrl || undefined;
    const combinationKey = baseVideoUrl || bRollCombination.join('->');

    // Duplicate check
    if (master.usedCombinations.includes(combinationKey)) {
      throw new Error("Duplicate Combination! This B-Roll sequence was already generated before. Try a different order or select other clips to avoid algorithm penalties.");
    }

    const varId = `var_${Math.random().toString(36).substring(2, 9)}`;
    const newVariation: VideoVariation = {
      id: varId,
      masterVideoId,
      userId: user.uid,
      productId,
      bRollCombination,
      combinationKey,
      status: 'pending',
      videoUrl: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save initial variation to Firestore
    await setDoc(doc(firestore, 'video_variations', varId), newVariation);

    // Trigger asynchronous simulated n8n pipeline (updates Firestore document)
    this.runSimulatedRenderPipeline(varId, masterVideoId, combinationKey, bRollCombination, onProgress);

    return newVariation;
  }

  async extractVideoMetadata(
    sessionId: string,
    videoId: string,
    videoUrl: string,
    videoName: string,
    duration: number
  ): Promise<any> {
    const webhookUrl = resolveWebhookUrl('ttchop_videoMetaExtractor', '/ai/meta');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, videoId, videoUrl, videoName, duration })
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }

    return response.json();
  }

  async generateDialogue(
    productId: string,
    _sessionIds: string[],
    _voiceId: string,
    collageTemplateId: string,
    language: string,
    onProgress: (status: string) => void
  ): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const [products, templates] = await Promise.all([
      this.getProducts(),
      this.getTemplates()
    ]);

    const product = products.find(p => p.id === productId);
    if (!product) throw new Error("Product not found.");

    const collageTemplate = templates.find(t => t.id === collageTemplateId);

    onProgress("Generating dialogue...");

    const webhookUrl = resolveWebhookUrl('ttchop_collage_dialogue', '/collage/dialogue');

    const payload = {
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        modelSheetUrls: product.modelSheetUrls
      },
      collageTemplate: {
        id: collageTemplate?.id || '',
        title: collageTemplate?.title || '',
        content: collageTemplate?.content || ''
      },
      language
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Webhook responded with status ${response.status}`);

    const data = await response.json();
    const item = Array.isArray(data) ? data[0] : data;
    return item?.output || item?.dialogue || item?.text || (typeof item === 'string' ? item : JSON.stringify(item));
  }

  async generateCollageVideo(
    productId: string,
    sessionIds: string[],
    voiceId: string,
    collageTemplateId: string,
    language: string,
    dialogue: string,
    onProgress: (status: string) => void,
    needsOverlay = false,
    overlayTemplateId = ''
  ): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const [products, allSessions, templates] = await Promise.all([
      this.getProducts(),
      this.getSessions(),
      this.getTemplates()
    ]);

    const product = products.find(p => p.id === productId);
    if (!product) throw new Error("Product not found.");

    const selectedSessions = allSessions.filter(s => sessionIds.includes(s.id));
    if (selectedSessions.length === 0) throw new Error("No sessions found.");

    const collageTemplate = templates.find(t => t.id === collageTemplateId) ?? null;

    // Create the render doc first so it appears in Renders tab immediately
    onProgress("Creating render entry...");
    const renderId = `render_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await this.createRender({
      type: needsOverlay ? 'collage+overlay' : 'collage',
      status: 'pending',
      productId,
      productName: product.name,
    }, renderId);

    onProgress("Sending to n8n...");

    const webhookUrl = resolveWebhookUrl('ttchop_collage_CreateCollage', '/collage/create');

    const isServerMode = getAppMode() === 'server';
    const sessionsPayload = isServerMode
      ? selectedSessions.map(s => ({
          id: s.id,
          videos: s.videos.map(c => ({
            id: c.id,
            downloadUrl: c.downloadUrl,
            duration: c.duration,
          })),
        }))
      : selectedSessions.map(s => ({
          id: s.id,
          name: s.name,
          clips: s.videos.map(c => ({
            id: c.id,
            name: c.name,
            url: c.downloadUrl,
            duration: c.duration,
            trimStart: c.trimStart,
            trimEnd: c.trimEnd,
            section: (c as any).section ?? null,
            source: c.source,
            metadataStatus: c.metadataStatus ?? null,
            aiMetadata: c.aiMetadata ?? null,
          })),
        }));

    const payload = {
      renderId,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        region: product.region ?? null,
      },
      sessions: sessionsPayload,
      collageTemplate: collageTemplate ? {
        id: collageTemplate.id,
        title: collageTemplate.title,
        description: collageTemplate.description,
        content: collageTemplate.content ?? '',
      } : null,
      language,
      dialogue,
      voiceId,
      needsOverlay,
      ...(needsOverlay && overlayTemplateId ? { overlayTemplateId } : {}),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      await this.updateRender(renderId, { status: 'failed', errorMessage: `Webhook error ${response.status}` });
      throw new Error(`Webhook responded with status ${response.status}`);
    }

    onProgress("Sent!");
    return renderId;
  }

  async getRenders(): Promise<Render[]> {
    const user = auth.currentUser;
    if (!user) return [];
    const q = query(collection(firestore, 'renders'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Render))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createRender(data: Omit<Render, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, customId?: string): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const id = customId ?? `render_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    await setDoc(doc(firestore, 'renders', id), { ...data, id, userId: user.uid, createdAt: now, updatedAt: now });
    return id;
  }

  async updateRender(id: string, data: Partial<Render>): Promise<void> {
    await updateDoc(doc(firestore, 'renders', id), { ...data, updatedAt: new Date().toISOString() });
  }

  async deleteRender(id: string): Promise<void> {
    await deleteDoc(doc(firestore, 'renders', id));
  }

  async archiveRenderVideo(renderId: string, sourceUrl: string): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');

    console.log(`[archive] ${renderId} — starting`);
    console.log(`[archive] ${renderId} — source url: ${sourceUrl}`);

    console.log(`[archive] ${renderId} — fetching video...`);
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const blob = await response.blob();
    console.log(`[archive] ${renderId} — fetched ${(blob.size / 1024 / 1024).toFixed(2)} MB (${blob.type})`);

    const storagePath = `users/${user.uid}/renders/${renderId}.mp4`;
    console.log(`[archive] ${renderId} — uploading to storage: ${storagePath}`);
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, blob, { contentType: 'video/mp4' });
    console.log(`[archive] ${renderId} — upload complete`);

    const storageUrl = await getDownloadURL(fileRef);
    console.log(`[archive] ${renderId} — storage url: ${storageUrl}`);

    await updateDoc(doc(firestore, 'renders', renderId), { videoUrl: storageUrl, updatedAt: new Date().toISOString() });
    console.log(`[archive] ${renderId} — firestore updated ✓`);

    return storageUrl;
  }

  async uploadOverlayVideo(file: File, onProgress: (pct: number) => void): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const ext = file.name.split('.').pop() ?? 'mp4';
    const path = `users/${user.uid}/overlay_uploads/${Date.now()}.${ext}`;
    const fileRef = ref(storage, path);
    onProgress(0);
    await uploadBytes(fileRef, file, { contentType: file.type || 'video/mp4' });
    onProgress(100);
    return getDownloadURL(fileRef);
  }

  async generateOverlay(
    productId: string,
    videoUrl: string,
    overlayTemplateId: string,
    onProgress: (status: string) => void
  ): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const [products, templates] = await Promise.all([
      this.getProducts(),
      this.getTemplates()
    ]);

    const product = products.find(p => p.id === productId);
    if (!product) throw new Error('Product not found.');

    const overlayTemplate = templates.find(t => t.id === overlayTemplateId) ?? null;

    onProgress('Creating render entry...');
    const renderId = `render_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await this.createRender({
      type: 'overlay',
      status: 'pending',
      productId,
      productName: product.name,
    }, renderId);

    onProgress('Sending to n8n...');

    const webhookUrl = resolveWebhookUrl('ttchop_overlay_creator', '/overlay/create');

    const payload = {
      renderId,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        region: product.region ?? null,
        modelSheetUrls: product.modelSheetUrls ?? [],
      },
      videoUrl,
      overlayTemplate: overlayTemplate ? {
        id: overlayTemplate.id,
        title: overlayTemplate.title,
        description: overlayTemplate.description,
        content: overlayTemplate.content ?? '',
      } : null,
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await this.updateRender(renderId, { status: 'failed', errorMessage: `Webhook error ${response.status}` });
      throw new Error(`Webhook responded with status ${response.status}`);
    }

    onProgress('Sent!');
    return renderId;
  }

  private async runSimulatedRenderPipeline(
    varId: string,
    masterVideoId: string,
    combinationKey: string,
    bRollIds: string[],
    onProgress: (status: string) => void
  ): Promise<void> {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const user = auth.currentUser;
    if (!user) return;

    try {
      const varDocRef = doc(firestore, 'video_variations', varId);
      
      await updateDoc(varDocRef, { status: 'rendering', updatedAt: new Date().toISOString() });
      
      onProgress("Sending webhook to n8n orchestrator...");
      await sleep(1000);

      onProgress("Downloading media assets and validating tracks...");
      await sleep(1000);

      onProgress("Trimming clips to match the master audio...");
      await sleep(1000);

      onProgress("Processing final video and audio mix (9:16 resolution)...");
      await sleep(1500);

      // Get video url placeholder from selected clip, now sourced from Sessions instead of Product.videos
      const sessions = await this.getSessions();
      const session = sessions.find(s => s.videos.some(v => v.id === bRollIds[0]));
      const videoObj = session?.videos.find(v => v.id === bRollIds[0]);
      const mockFinalVideoUrl = videoObj?.downloadUrl || "https://assets.mixkit.co/videos/preview/mixkit-pouring-hot-coffee-into-a-cup-42207-large.mp4";

      // Complete the variation in Firestore
      await updateDoc(varDocRef, {
        status: 'completed',
        videoUrl: mockFinalVideoUrl,
        updatedAt: new Date().toISOString()
      });

      // Update usedCombinations array in master video doc in Firestore
      const masterRef = doc(firestore, 'master_videos', masterVideoId);
      const master = await this.getMasterVideoById(masterVideoId);
      if (master) {
        await updateDoc(masterRef, {
          usedCombinations: [...master.usedCombinations, combinationKey],
          variationsCount: master.variationsCount + 1
        });
      }

    } catch (error: any) {
      console.error("Error in render simulation pipeline", error);
      const varDocRef = doc(firestore, 'video_variations', varId);
      await updateDoc(varDocRef, {
        status: 'failed',
        errorMessage: error.message || "Unexpected error during rendering",
        updatedAt: new Date().toISOString()
      });
    }
  }
  // ── ScheduledRenders ─────────────────────────────────────────────────────

  async getScheduledRenders(): Promise<ScheduledRender[]> {
    const user = auth.currentUser;
    if (!user) return [];
    const q = query(collection(firestore, 'scheduled_renders'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ScheduledRender))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  async createScheduledRender(data: Omit<ScheduledRender, 'id' | 'userId' | 'createdAt'>): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const docRef = await addDoc(collection(firestore, 'scheduled_renders'), {
      ...data,
      userId: user.uid,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  }

  async updateScheduledRender(id: string, data: Partial<Omit<ScheduledRender, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(firestore, 'scheduled_renders', id), data);
  }

  async deleteScheduledRender(id: string): Promise<void> {
    await deleteDoc(doc(firestore, 'scheduled_renders', id));
  }

  async getUserPref(key: string): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) return null;
    const snap = await getDoc(doc(firestore, 'user_prefs', user.uid));
    return snap.exists() ? (snap.data()[key] ?? null) : null;
  }

  async setUserPref(key: string, value: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    await setDoc(doc(firestore, 'user_prefs', user.uid), { [key]: value }, { merge: true });
  }
}

export const db = new DatabaseService();
