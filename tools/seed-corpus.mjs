// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The example vault's content. 4.43.
//
// ── WHY THIS IS WRITTEN OUT AND NOT GENERATED ────────────────────────────
//
// The vault this fills is the one a stranger downloads to find out what Almanac
// is. Lorem ipsum in a Chemistry lesson says the plugin is a demo; "Chirality
// and R,S notation" with three real takeaways under it says a person used this.
// Every widget in the plugin renders *someone's notes*, and a corpus of
// placeholder strings would make each of them look like a form with nothing in
// it.
//
// SO THE PROSE IS THE POINT, and it is deliberately short. Each note carries
// enough to be plausible in a screenshot and to give the tables, ratings and
// task counts something true to read — not a real textbook. Nothing here is
// copied from anywhere; it is ordinary subject-matter phrasing.
//
// ── THE SHAPE IS THE JOURNAL'S, NOT THIS FILE'S ──────────────────────────
//
// A journal declares levels (Subject → Topic, Area → Project, Block, Medium)
// and kinds (Lesson, Practice, Update, Decision, Workout, Meal, Title), and this
// file only fills them. `containers` is level 0; `children` is level 1 where the
// journal has one, and is simply absent where it does not — the engine reads the
// journal's own manifest to know which, so a preset that gains a level does not
// need this file rewritten, only extended.
//
// `sections` KEYS ARE THE TEMPLATE'S OWN HEADINGS. The engine replaces what sits
// under a matching `## Heading` and leaves every other line of the template
// alone, so a template edit is picked up rather than fought. A heading named
// here that the template does not have is reported rather than silently dropped.

export const CORPUS = {
  // ── Study: Subject → Topic → Lesson / Practice ────────────────────────
  study: {
    containers: [
      {
        name: "Organic Chemistry",
        emoji: "🧪",
        children: [
          {
            name: "Stereochemistry",
            emoji: "🔬",
            notes: [
              {
                kind: "lesson",
                title: "Chirality and R,S notation",
                rating: 4,
                status: "completed",
                sections: {
                  Overview:
                    "A carbon with four different groups has a non-superimposable mirror image. Naming which one you have is the whole of R,S — everything downstream (optical rotation, biological activity, reaction outcomes) depends on getting it right first.",
                  "Key Concepts": [
                    "**Definition:** a stereocentre is an atom whose four substituents are all different.",
                    "**Example:** bromochlorofluoromethane — one carbon, four different halogens, two enantiomers.",
                    "**Priority:** rank substituents by atomic number at the first point of difference (CIP rules).",
                  ],
                  "Key Takeaways": [
                    "Lowest priority group points away from you, then read 1→2→3.",
                    "Clockwise is R, anticlockwise is S. If the lowest group points *toward* you, read it and invert.",
                    "Enantiomers share every physical property except the direction they rotate plane-polarised light.",
                  ],
                  "Connected Ideas": [
                    "[[Newman projections]] — the same molecule, drawn to show the conformation rather than the configuration.",
                  ],
                  Next: ["[[Diastereomers and meso compounds]]"],
                },
                tasks: [
                  { text: "Re-draw the four CIP priority cases from memory", done: true },
                  { text: "Check the inversion trick on three worked examples", done: false },
                ],
                recall: [
                  ["What makes an atom a stereocentre?", "Four different substituents — swap any two and you get the mirror image, not the same molecule."],
                  ["Which way do you read the priorities once the lowest points away?", "1 → 2 → 3. Clockwise is R, anticlockwise is S."],
                ],
              },
              {
                kind: "lesson",
                title: "Newman projections",
                rating: 3,
                status: "in-progress",
                sections: {
                  Overview:
                    "A way of looking straight down a carbon–carbon bond so the torsion angle between front and back groups is visible. Conformational energy arguments are almost always drawn this way.",
                  "Key Concepts": [
                    "**Definition:** front carbon is a point with three bonds, back carbon a circle with three.",
                    "**Example:** butane rotated about C2–C3 gives anti, gauche and two eclipsed forms.",
                  ],
                  "Key Takeaways": [
                    "Anti is the lowest energy staggered form; the two bulky groups are 180° apart.",
                    "Gauche costs about 3.8 kJ/mol over anti — a steric penalty, not an electronic one.",
                    "Eclipsed forms are maxima, not minima. Nothing sits there.",
                  ],
                  "Connected Ideas": [
                    "[[Chirality and R,S notation]] — configuration is fixed, conformation is what rotates.",
                  ],
                  Next: ["[[Ring flips in cyclohexane]]"],
                },
                tasks: [
                  { text: "Sketch the full energy profile for butane C2–C3", done: false },
                ],
                recall: [["Why is gauche higher in energy than anti?", "The two large groups sit 60° apart rather than 180°, so they crowd each other — about 3.8 kJ/mol in butane."]],
              },
              {
                kind: "practice",
                title: "Assigning R and S — 20 structures",
                rating: 5,
                status: "completed",
                sections: {
                  "Related Lessons": [
                    "[[Chirality and R,S notation]] — the priority rules this drills.",
                  ],
                  Summary: "16 of 20 right first pass. The four misses were all lowest-priority-toward-you cases.",
                },
                tasks: [{ text: "Redo the four I got wrong", done: true }],
              },
            ],
          },
          {
            name: "Reaction Mechanisms",
            emoji: "⚗️",
            notes: [
              {
                kind: "lesson",
                title: "SN1 versus SN2",
                rating: 3,
                status: "in-progress",
                sections: {
                  Overview:
                    "Two substitution mechanisms that answer the same question differently: does the leaving group go before the nucleophile arrives, or at the same moment? Almost every exam question here is really asking which one the conditions favour.",
                  "Key Concepts": [
                    "**Definition:** SN2 is one concerted step with backside attack; SN1 goes through a carbocation.",
                    "**Example:** tertiary halide in a polar protic solvent → SN1. Primary halide with a strong nucleophile → SN2.",
                  ],
                  "Key Takeaways": [
                    "SN2 inverts configuration every time. SN1 racemises, because the cation is planar.",
                    "Rate: SN2 depends on both substrate and nucleophile; SN1 depends only on the substrate.",
                    "Substitution pattern decides it more often than anything else does.",
                  ],
                  "Connected Ideas": [
                    "[[Chirality and R,S notation]] — inversion is only meaningful if you can name the configuration.",
                  ],
                  Next: ["[[E1 and E2 elimination]]"],
                },
                tasks: [
                  { text: "Table the four substrate classes against both mechanisms", done: false },
                  { text: "Work through the solvent-effect problems", done: false },
                ],
                recall: [
                  ["Which mechanism racemises, and why?", "SN1. The carbocation is planar, so the nucleophile attacks either face equally."],
                  ["What does the rate of SN1 depend on?", "The substrate alone. Ionisation is the slow step, so the nucleophile does not appear in the rate law."],
                ],
              },
              {
                kind: "practice",
                title: "Mechanism arrows — mixed set",
                rating: 3,
                status: "in-progress",
                sections: {
                  "Related Lessons": ["[[SN1 versus SN2]] — the two this set mixes."],
                  Summary: "Substitution fine, elimination not. Arrows keep starting from the wrong lone pair.",
                },
                tasks: [{ text: "Re-attempt the elimination half", done: false }],
              },
            ],
          },
        ],
      },
      {
        name: "Linear Algebra",
        emoji: "📐",
        children: [
          {
            name: "Vector Spaces",
            emoji: "🧮",
            notes: [
              {
                kind: "lesson",
                title: "Basis and dimension",
                rating: 4,
                status: "completed",
                sections: {
                  Overview:
                    "A basis is the smallest set of vectors that still describes everything in the space. Dimension is how many you needed — and the surprise is that the number never depends on which basis you picked.",
                  "Key Concepts": [
                    "**Definition:** a basis is linearly independent and spans the space.",
                    "**Example:** the standard basis of R³ is three vectors; so is any other basis of R³.",
                  ],
                  "Key Takeaways": [
                    "Independent + spanning is the whole definition; drop either and it is not a basis.",
                    "Every basis of a given space has the same size. That size is the dimension.",
                    "Any independent set can be extended to a basis; any spanning set can be reduced to one.",
                  ],
                  "Connected Ideas": [
                    "[[Rank and nullity]] — both are dimensions of subspaces attached to a matrix.",
                  ],
                  Next: ["[[Rank and nullity]]"],
                },
                tasks: [{ text: "Prove the extension lemma without looking", done: true }],
                recall: [["Why does every basis of a space have the same size?", "The exchange lemma — any independent set can be swapped into a spanning set one vector at a time, so neither can be larger."]],
              },
              {
                kind: "lesson",
                title: "Rank and nullity",
                rating: 2,
                status: "in-progress",
                sections: {
                  Overview:
                    "The rank–nullity theorem says the columns you can use and the directions you destroy always add up to the number of columns you started with. It is a bookkeeping identity, and it is the one to reach for whenever a dimension is unknown.",
                  "Key Concepts": [
                    "**Definition:** rank is the dimension of the column space; nullity is the dimension of the kernel.",
                    "**Example:** a 3×4 matrix of rank 2 has nullity 2 — four columns, two used, two collapsed.",
                  ],
                  "Key Takeaways": [
                    "rank + nullity = number of columns. Always, for any matrix.",
                    "Row rank equals column rank, which is not obvious and is worth proving once.",
                    "Full rank means the kernel is trivial, which means injective.",
                  ],
                  "Connected Ideas": ["[[Basis and dimension]] — rank is a dimension."],
                  Next: ["[[Eigenvalues and eigenvectors]]"],
                },
                tasks: [
                  { text: "Work the rank-nullity proof from the definition", done: false },
                  { text: "Ten worked examples with non-square matrices", done: false },
                ],
                recall: [["State rank–nullity. What is it counting on each side?", "rank + nullity = dim(domain). Directions the map keeps, plus directions it collapses, is every direction you started with."]],
              },
              {
                kind: "practice",
                title: "Row reduction drill",
                rating: 4,
                status: "completed",
                sections: {
                  "Related Lessons": ["[[Rank and nullity]] — reading rank off the echelon form."],
                  Summary: "Clean run. Echelon form is automatic now; reading nullity off it still needs a pause.",
                },
                tasks: [],
              },
            ],
          },
        ],
      },
      {
        name: "Spanish",
        emoji: "🇪🇸",
        children: [
          {
            name: "Past Tenses",
            emoji: "🗣️",
            notes: [
              {
                kind: "lesson",
                title: "Pretérito versus imperfecto",
                rating: 2,
                status: "in-progress",
                sections: {
                  Overview:
                    "Both are past tenses and English collapses them into one, which is exactly why they are hard. The choice is about whether the event is a closed box or a background.",
                  "Key Concepts": [
                    "**Definition:** pretérito is a completed action; imperfecto is an ongoing or habitual state.",
                    "**Example:** *comí* — I ate (once, done). *comía* — I used to eat / I was eating.",
                  ],
                  "Key Takeaways": [
                    "Ask whether the sentence draws a boundary around the event. Boundary → pretérito.",
                    "Descriptions, weather, age, time of day and feelings almost always take imperfecto.",
                    "Both appear in one sentence constantly: the imperfecto sets the scene, the pretérito interrupts it.",
                  ],
                  "Connected Ideas": [],
                  Next: ["[[Subjunctive triggers]]"],
                },
                tasks: [
                  { text: "Twenty sentences, choose the tense and justify each", done: false },
                ],
                recall: [["Which tense interrupts the other, and which sets the scene?", "Pretérito interrupts; imperfecto sets the scene. *Leía* cuando *sonó* el teléfono."]],
              },
              {
                kind: "practice",
                title: "Conjugation drill — irregular preterites",
                rating: 3,
                status: "in-progress",
                sections: {
                  "Related Lessons": ["[[Pretérito versus imperfecto]]"],
                  Summary: "The nine stem-changers are the whole problem. Everything regular is fine.",
                },
                tasks: [{ text: "The nine stem-changers, cold", done: false }],
              },
            ],
          },
        ],
      },
    ],
  },

  // ── Projects: Area → Project → Update / Decision ──────────────────────
  projects: {
    containers: [
      {
        name: "Home",
        emoji: "🏠",
        children: [
          {
            name: "Kitchen Rewire",
            emoji: "🔌",
            notes: [
              {
                kind: "decision",
                trackers: { confidence: 4 },
                title: "Run the under-cabinet lighting on its own circuit",
                status: "completed",
                sections: {
                  Overview: [
                    "**Decision:** its own 6A circuit off the consumer unit, not spurred from the ring.",
                    "The ring is already carrying the oven and the dishwasher. Adding eight LED strips is well within capacity on paper, but it puts the lighting behind the same RCD as the appliances.",
                  ],
                  Notes: [
                    "Options considered:",
                    "  - Spur from the existing ring — cheapest, no board work.",
                    "  - New 6A circuit — one afternoon of board work, own RCBO.",
                    "  - Plug-in transformers — no board work, visible cabling.",
                  ],
                  "Next steps":
                    "An appliance fault no longer takes the kitchen lights out with it. Costs an afternoon and a spare way in the consumer unit, which there is.",
                },
                tasks: [{ text: "Confirm the spare way is not reserved for the shower", done: true }],
              },
              {
                kind: "update",
                trackers: { confidence: 3 },
                title: "First fix complete",
                status: "completed",
                sections: {
                  Overview:
                    "All cable runs in, back boxes set, board work done. The new RCBO is in and labelled. Everything is dead until the sockets go on.",
                  Notes: ["Waiting on the worktop template before the socket heights are final."],
                  "Next steps": ["Second fix once the worktop is in", "Book the certificate"],
                },
                tasks: [
                  { text: "Chase the worktop template date", done: true },
                  { text: "Book the electrician for sign-off", done: false },
                ],
              },
              {
                kind: "update",
                trackers: { confidence: 4 },
                title: "Second fix and sign-off",
                status: "in-progress",
                sections: {
                  Overview:
                    "Sockets and switches on, lighting tested on the new circuit. Certificate issued and filed.",
                  Notes: [],
                  "Next steps": ["Touch up the plaster around the two new back boxes"],
                },
                tasks: [{ text: "Fill and sand around the back boxes", done: false }],
              },
            ],
          },
          {
            name: "Garden Beds",
            emoji: "🌱",
            notes: [
              {
                kind: "update",
                trackers: { confidence: 5 },
                title: "Beds built and filled",
                status: "completed",
                sections: {
                  Overview:
                    "Three raised beds, 2.4m by 1.2m, scaffold boards doubled. Filled with a topsoil and compost mix, roughly three to one.",
                  Notes: [],
                  "Next steps": ["Plan the first rotation", "Order seed"],
                },
                tasks: [{ text: "Order seed for the first rotation", done: false }],
              },
            ],
          },
        ],
      },
      {
        name: "Software",
        emoji: "💻",
        children: [
          {
            name: "Almanac",
            emoji: "📔",
            notes: [
              {
                kind: "decision",
                trackers: { confidence: 4 },
                title: "Journal order lives in the settings array",
                status: "completed",
                sections: {
                  Overview: [
                    "**Decision:** reorder `customJournals` itself rather than adding an order field to each journal.",
                    "Every surface that lists journals already draws them in array order, so the array *is* the order and always has been.",
                  ],
                  Notes: [
                    "Options considered:",
                    "  - An `order:` number on each journal — explicit, and one more thing to keep consistent.",
                    "  - Reorder the array — no new field, no migration, nothing to drift.",
                  ],
                  "Next steps":
                    "Reordering is a permutation of a list the plugin already owns. Nothing is stored that could disagree with the drawing order, because there is nothing else to disagree with.",
                },
                tasks: [],
              },
              {
                kind: "update",
                trackers: { confidence: 3 },
                title: "Drag on the cards, a window on the sections",
                status: "completed",
                sections: {
                  Overview:
                    "The homepage draws journals as cards, so those are dragged. The Journals page draws them as full-width sections with their contents inside, so that gets a button and a small window. One write underneath both.",
                  Notes: [],
                  "Next steps": ["Watch for whether anyone looks for the drag on the sections page"],
                },
                tasks: [
                  { text: "Check the keyboard path through the reorder window", done: true },
                  { text: "Screenshot both surfaces for the docs", done: false },
                ],
              },
              {
                kind: "update",
                trackers: { confidence: 2 },
                title: "Card borders were never drawing",
                status: "completed",
                sections: {
                  Overview:
                    "Three releases of white card edges traced to one rule: a token that named a theme colour was declared on `:root`, and Obsidian declares its colours on `body`. A custom property's references resolve where it is declared, so the token was invalid everywhere.",
                  Notes: [],
                  "Next steps": ["Sweep the rest of the token file for the same shape"],
                },
                tasks: [{ text: "Add the structural guard to the token tests", done: true }],
              },
            ],
          },
        ],
      },
    ],
  },

  // ── Exercise & Diet: Block → Workout / Meal ───────────────────────────
  "exercise-diet": {
    containers: [
      {
        name: "Base Building",
        emoji: "🏃",
        notes: [
          {
            kind: "workout",
            title: "Easy 5k",
            rating: 2,
            status: "completed",
            trackers: { duration: 31, distance: 5.1, calories: 380 },
            sections: {
              Overview: [
                "5k at conversational pace, flat loop.",
                "Legs felt heavy for the first kilometre, fine after.",
              ],
              Notes: "Kept it genuinely easy. Whole point of the block.",
            },
            tasks: [],
          },
          {
            kind: "workout",
            title: "Intervals — 6 × 800m",
            rating: 4,
            status: "completed",
            trackers: { duration: 44, distance: 8.2, calories: 610 },
            sections: {
              Overview: [
                "6 × 800m at 5k effort, 90s jog recovery.",
                "Splits held within four seconds across the set.",
              ],
              Notes: "Last two were work. Recovery is the right length.",
            },
            tasks: [{ text: "Add a seventh next week if the splits hold", done: false }],
          },
          {
            kind: "workout",
            title: "Long run — 16k",
            rating: 3,
            status: "completed",
            trackers: { duration: 98, distance: 16.4, calories: 1150 },
            sections: {
              Overview: ["16.4k, rolling, deliberately slow.", "Fuelled at 8k and 13k."],
              Notes: "Fuelling early made the last 4k much better than last time.",
            },
            tasks: [],
          },
          {
            kind: "meal",
            title: "Overnight oats",
            status: "completed",
            trackers: { calories: 520, protein: 28 },
            sections: {
              Overview: [
                "80g rolled oats",
                "250ml milk",
                "1 scoop whey",
                "Handful of frozen berries",
              ],
              Notes: "Made three at once. Holds fine to day three.",
            },
            tasks: [],
          },
          {
            kind: "meal",
            title: "Chicken, rice and greens",
            status: "completed",
            trackers: { calories: 680, protein: 52 },
            sections: {
              Overview: ["200g chicken thigh", "150g cooked rice", "Broccoli", "Soy and ginger"],
              Notes: "The default. Cooks in the time the rice takes.",
            },
            tasks: [],
          },
        ],
      },
      {
        name: "Strength Block",
        emoji: "🏋️",
        notes: [
          {
            kind: "workout",
            title: "Lower — squat focus",
            rating: 4,
            status: "completed",
            trackers: { duration: 62, calories: 430 },
            sections: {
              Overview: [
                "Back squat 5 × 5 @ 80kg",
                "Romanian deadlift 3 × 8 @ 70kg",
                "Split squat 3 × 10 each side",
              ],
              Notes: "Squat moved well. Depth held on every set.",
            },
            tasks: [{ text: "Add 2.5kg next session", done: false }],
          },
          {
            kind: "workout",
            title: "Upper — press focus",
            rating: 3,
            status: "completed",
            trackers: { duration: 55, calories: 360 },
            sections: {
              Overview: [
                "Overhead press 5 × 5 @ 45kg",
                "Weighted pull-up 4 × 6 @ +10kg",
                "Dips 3 × 10",
              ],
              Notes: "Press is the lagging lift. Keep it first.",
            },
            tasks: [],
          },
          {
            kind: "meal",
            title: "Post-session shake",
            status: "completed",
            trackers: { calories: 340, protein: 40 },
            sections: {
              Overview: ["2 scoops whey", "Banana", "300ml milk"],
              Notes: "Within the half hour, not that it matters as much as people say.",
            },
            tasks: [],
          },
        ],
      },
    ],
  },

  // ── Media: Medium → Title ─────────────────────────────────────────────
  media: {
    containers: [
      {
        name: "Books",
        emoji: "📚",
        notes: [
          {
            kind: "title",
            title: "The Design of Everyday Things",
            rating: 5,
            status: "completed",
            trackers: { pagesRead: 368 },
            sections: {
              Overview:
                "Affordances, signifiers and mapping — why a door you push when it says pull is the door's fault and not yours.",
              Notes: [
                "The vocabulary is the useful part. Once you have 'signifier' you see them everywhere.",
                "The chapter on error is the one worth re-reading: design for the mistake people will make.",
              ],
            },
            tasks: [],
          },
          {
            kind: "title",
            title: "Thinking in Systems",
            rating: 4,
            status: "in-progress",
            trackers: { pagesRead: 140 },
            sections: {
              Overview:
                "Stocks, flows and feedback loops, and why intervening at the wrong leverage point makes a system worse.",
              Notes: ["Halfway. The leverage-points list alone is worth the book."],
            },
            tasks: [{ text: "Finish part two", done: false }],
          },
          {
            kind: "title",
            title: "Piranesi",
            rating: 5,
            status: "completed",
            trackers: { pagesRead: 245 },
            sections: {
              Overview: "A man, a house of endless halls and tides, and a journal he cannot fully trust.",
              Notes: ["Read it in two sittings. Best not to know anything going in."],
            },
            tasks: [],
          },
        ],
      },
      {
        name: "Film",
        emoji: "🎬",
        notes: [
          {
            kind: "title",
            title: "Arrival",
            rating: 5,
            status: "completed",
            trackers: { minutes: 116 },
            sections: {
              Overview: "First contact told through linguistics, and a structure that only resolves at the end.",
              Notes: ["The sound design does half the work."],
            },
            tasks: [],
          },
          {
            kind: "title",
            title: "Paddington 2",
            rating: 5,
            status: "completed",
            trackers: { minutes: 103 },
            sections: {
              Overview: "A bear, a pop-up book, and a prison kitchen turned around by marmalade.",
              Notes: ["Genuinely without a bad scene."],
            },
            tasks: [],
          },
        ],
      },
      {
        name: "TV",
        emoji: "📺",
        notes: [
          {
            kind: "title",
            title: "The Bear — series one",
            rating: 4,
            status: "completed",
            trackers: { minutes: 240 },
            sections: {
              Overview: "A fine-dining chef inherits a sandwich shop and everyone's grief with it.",
              Notes: ["Episode seven is one take and it earns it."],
            },
            tasks: [],
          },
        ],
      },
      {
        name: "Games",
        emoji: "🎮",
        notes: [
          {
            kind: "title",
            title: "Outer Wilds",
            rating: 5,
            status: "completed",
            trackers: { minutes: 1320 },
            sections: {
              Overview: "A solar system on a 22-minute loop, and the only progression is what you understand.",
              Notes: ["Nothing unlocks. You just know more. Do not look anything up."],
            },
            tasks: [],
          },
        ],
      },
    ],
  },
};

// ── The diary ────────────────────────────────────────────────────────────
//
// A daily entry is mostly trackers, and its prose is one or two lines. These are
// drawn from rather than assigned in order, so a year of entries does not read
// as a loop — the engine's seeded generator picks, which is what keeps the same
// seed producing the same year.
// ── WHY THE DAY LINES ARE THREE LISTS AND NOT ONE (4.83) ─────────────────
//
// The engine now knows what kind of day it generated — five hours' sleep and a
// mood of 2 is not the same day as eight hours and a 5 — and a corpus drawn
// from uniformly cannot say so. A year in which "Cleared the desk, cleared the
// inbox, cleared the head" lands on the worst-rated day of the month is a year
// whose numbers and whose prose are about two different people, and the reader
// who notices is the reader looking closely enough to be worth convincing.
//
// So the tone is part of the corpus rather than a thing the engine infers from
// the words. `DIARY_LINES` stays exported as the flat concatenation, because a
// line is a line and the "no two lists share a sentence" invariant is asserted
// over all of them at once.
export const DIARY_LINES_GOOD = [
  "Got the difficult thing done first and the rest was easy.",
  "Cleared the desk, cleared the inbox, cleared the head.",
  "Finally saw why it wasn't working. Obvious in hindsight.",
  "Long walk before it got warm. Worth the early alarm.",
  "Went in early to get ahead of the noise. It worked.",
  "Caught up on the backlog that had been bothering me all week.",
  "Cooked properly for once rather than assembling something.",
  "Woke before the alarm and the morning was twice as long.",
  "Wrote the thing in one sitting, which almost never happens.",
  "Said no to two meetings and got the afternoon back.",
];

export const DIARY_LINES_MIXED = [
  "Quiet start, then the afternoon ran away. Better than yesterday.",
  "Two good hours of work and then nothing useful. Fine.",
  "Slow morning on purpose. No guilt about it.",
  "Nothing much happened and that was the point.",
  "Rained all day. Read instead, which was the right trade.",
  "Good conversation over lunch that changed how I'm thinking about the project.",
  "Half a day of admin, half a day of the real thing. About the usual split.",
  "Kept moving without ever quite getting going. Some days are that.",
  "Errands all morning, so the work started late and finished late.",
  "Nothing finished, but three things are closer than they were.",
];

export const DIARY_LINES_HARD = [
  "Frustrating day — three attempts at the same problem, none of them right.",
  "Late night, and I'll pay for it tomorrow.",
  "Legs sore from yesterday. Kept it easy.",
  "Woke at four and never really got back to sleep.",
  "Everything took twice as long as it should have.",
  "Ran out of patience before I ran out of day.",
  "Too many small interruptions to hold anything in my head.",
  "Under the weather. Did the minimum and stopped early.",
  "Read the same paragraph until I gave up and went outside.",
  "One of those days that is mostly about getting to the end of it.",
];

// The flat list, which is what the tone-blind callers and the corpus tests
// want. Order is good → mixed → hard and nothing depends on it.
export const DIARY_LINES = [...DIARY_LINES_GOOD, ...DIARY_LINES_MIXED, ...DIARY_LINES_HARD];

// Keyed by the tone the day model reports, so the engine asks for a tone and
// never for an index. A tone this map does not have falls back to the flat list
// at the call site rather than here.
export const DIARY_LINES_BY_TONE = {
  good: DIARY_LINES_GOOD,
  mixed: DIARY_LINES_MIXED,
  hard: DIARY_LINES_HARD,
};

// The daily's four written regions. Kept as four separate lists rather than one
// blob because the template asks four different QUESTIONS — "what are you
// focusing on today?", "what went well?", "what got in the way?" — and a seeded
// vault whose Challenges read like its Highlights teaches the reader that the
// prompts do not matter. Each list is written to answer its own prompt.
//
// LENGTH IS A FEATURE HERE (4.83). Ten lines over two hundred and seventy days
// is each line seventeen times, which a reader scrolling the on-this-day widget
// sees immediately; the engine also refuses to repeat a line while it is still
// recent, and a short list makes that refusal impossible to honour.
export const DIARY_FOCUS = [
  "Finish the stereochemistry problem set before it stacks up.",
  "One long run, then leave the legs alone.",
  "Ship the import path and stop redesigning it.",
  "Read for two hours without reaching for the phone.",
  "Clear the inbox down to nothing, however boring.",
  "Get the difficult conversation out of the way early.",
  "Draft the whole thing badly, edit tomorrow.",
  "Nothing scheduled. Keep it that way.",
  "Test coverage on the parser — it has been owed for a fortnight.",
  "Cook something that takes longer than twenty minutes.",
  "One task, start to finish, before opening anything else.",
  "Write the migration note while the reasoning is still in my head.",
  "Walk at lunch whatever the weather.",
  "Answer the three emails I have been stepping around.",
  "Close two branches rather than opening a third.",
  "Revision only — no new material today.",
  "Leave the desk at six and mean it.",
  "Plan the week properly instead of improvising it on Tuesday.",
];

export const DIARY_HIGHLIGHTS = [
  "Solved it on the third attempt and the fix was four lines.",
  "Walked the long way home and the evening was worth it.",
  "Someone said the docs were clear, which was unexpected.",
  "Hit the pace target on the last interval rather than fading.",
  "Finished the chapter I have been carrying around for a month.",
  "Good lunch, better conversation.",
  "Inbox empty for the first time since June.",
  "Cooked properly and there were leftovers.",
  "The refactor came out smaller than the thing it replaced.",
  "Slept through the night without waking at four.",
  "Explained the design out loud and it held up.",
  "Found the bug by reading rather than by printing.",
  "Went outside between the two hard blocks and came back sharper.",
  "Closed the oldest thing on the list.",
  "Wrote two pages that will not need rewriting.",
  "The test suite went green on the first run.",
  "Turned down something I would have said yes to a year ago.",
  "Made the diagram simple enough that nobody asked about it.",
];

export const DIARY_CHALLENGES = [
  "Lost the morning to a merge conflict that should have taken ten minutes.",
  "Woke up tired and never really caught up with the day.",
  "Kept reaching for the phone between paragraphs.",
  "Rain meant the run became a treadmill, which I resented.",
  "Three interruptions in the two hours I had set aside.",
  "Read the same page four times before giving up.",
  "Underestimated the task by roughly a factor of three.",
  "Ate badly because I had not planned anything.",
  "Started the difficult thing at five o'clock, which was too late.",
  "Went round in circles on a decision that did not matter.",
  "Answered messages all afternoon and finished nothing.",
  "Sat down to write and reorganised my notes instead.",
  "The build broke for a reason nobody could reproduce.",
  "Skipped lunch and felt it by three.",
  "Said yes to a meeting I should have declined.",
  "Too warm to sleep, so the whole day started behind.",
  "Kept switching between two tasks and did neither well.",
  "Spent an hour on a setting nobody will ever notice.",
];

// ── The tasks, and the two shapes a seeded one comes in (4.83) ───────────
//
// `DIARY_TASKS` is the everyday list: small, personal, done within a day or two
// of being written, and the reason the engine can cross almost all of them off
// without the vault reading as fiction.
//
// `DIARY_TASKS_STANDING` is the other kind — the ones with an hour and a date,
// which is the only kind the TIME GRID can draw. A task without `due` is a fact
// about no particular day, so a vault seeded entirely from the list above left
// the grid's task lane empty on every one of its days.
export const DIARY_TASKS = [
  "Reply to the email that has been sitting there",
  "Book the appointment",
  "Push the branch before it goes stale",
  "Groceries — actual list this time",
  "Read one chapter",
  "Renew the subscription or cancel it, either is fine",
  "Back up the vault",
  "Stretch, properly, for ten minutes",
  "Write up yesterday's notes while they still mean something",
  "Sort the photos off the phone",
  "Pay the invoice before it goes late",
  "Ring the bank about the duplicate charge",
  "Put the winter clothes somewhere sensible",
  "Water the plants that are still alive",
  "Order the part for the bike",
  "Update the CV while there is something to add",
  "Cancel the thing I signed up to in January",
  "Take the recycling out properly this time",
  "Send the photos I promised three weeks ago",
  "Print the form and actually post it",
];

export const DIARY_TASKS_STANDING = [
  "Call the surgery when the line opens",
  "Collect the parcel before the depot shuts",
  "Join the retro call",
  "Drop the car in for its service",
  "Meet Ben at the station",
  "Sign the paperwork before the deadline",
];

// ── The logs (4.62) ──────────────────────────────────────────────────────
//
// WHY A SEEDED VAULT NEEDED THESE. Four logbooks ship with the scaffold and a
// `Captured` region sits in every daily template, and until now the seeder wrote
// to none of them — so the Logbooks note, the Meetings agenda, the capture log
// and (since 4.61) the time grid all rendered their empty states in the vault
// that exists to show them full. A stranger opening the example vault learned
// that half the plugin does nothing.
//
// THE LOG GRAMMAR IS ONE GRAMMAR, WRITTEN IN TWO PLACES. A logbook item and a
// capture are the same stamped line — `log-items.ts` parses both — and the only
// difference is whether the stamp carries a day. So these are lists of TEXT and
// the engine stamps them, rather than lists of pre-stamped lines that would have
// to restate a format the plugin already owns.

// The work log: what somebody did, in the words they would use afterwards.
// Written as things that TOOK a length, because the whole point of `[mins:: …]`
// is that a work log can be added up — and a book of moments would draw as a
// row of flat marks on the time grid and never as a block.
export const WORK_LOG = [
  "Rewrote the import path so it reads the manifest instead of guessing",
  "Paired on the migration script — found two cases the tests never covered",
  "Wrote up the incident notes while they were still fresh",
  "Went through the backlog and closed eleven things nobody wanted",
  "Drafted the API changes for review, badly, on purpose",
  "Traced the slow query to a missing index and left the fix behind a flag",
  "Sat with the support inbox for an hour to see what people actually ask",
  "Reworked the empty states — every one of them said 'no data'",
  "Read the spec properly rather than the summary of it",
  "Cut the build in half by stopping it from doing the same work twice",
  "Interviewed, then wrote the feedback up straight away",
  "Fixed the flake in the parser suite. It was the clock, as usual",
  "Moved the docs into the repo so they go stale visibly",
  "Long planning session — got to a shape everyone could live with",
  "Cleared the review queue before it turned into a wall",
  "Wrote the migration note for people upgrading from the old layout",
  "Took the diagram apart and drew it again with fewer boxes",
  "Chased the flaky deploy and found a race in the health check",
  "Wrote the failing test first, which made the fix obvious",
  "Went through the error strings and rewrote the six nobody could act on",
  "Split the settings page in two so each half fits on a screen",
  "Spent the morning deleting code that had no callers left",
  "Walked a new starter through the layout and found three things I could not explain",
  "Benchmarked the parser properly rather than guessing at it",
  "Merged the long-running branch before it grew a second week of drift",
  "Turned the runbook into a script, which is what it always wanted to be",
];

// The focus book: what you are working towards, and when that changed. Fewer
// items on purpose — a focus that changes twice a week is not a focus, and a
// book with forty entries in it would say the opposite of what it is for.
export const FOCUS_LOG = [
  "Ship the import path, then stop touching it for a month",
  "Get the test suite under a minute so people run it",
  "Learn enough of the query planner to stop guessing",
  "Write the documentation for the thing before the thing",
  "One release a fortnight, small enough to describe in a sentence",
  "Reduce the number of open branches to something I can hold in my head",
  "Say no to the second project until the first one lands",
];

// Review links: things to come back to. Crossed off when you have, which is why
// roughly half of them are marked done by the engine — a list where nothing is
// ever completed reads as a list nobody uses.
export const REVIEW_LINKS = [
  "The talk on incremental parsing someone linked in the channel",
  "That thread about pagination cursors — worth re-reading properly",
  "Chapter 4 of the concurrency book, the part I skimmed",
  "The post comparing the three migration strategies",
  "Docs for the new date API before the deprecation lands",
  "The bug report with the beautiful reproduction — worth copying the style",
  "Half-written note on why the cache invalidation broke in June",
  "The interview with the person who wrote the original scheduler",
  "Colour contrast checker for the dark theme",
  "Old design doc for the layout engine, for the parts we dropped",
];

// Captures: the raw arriving thought, which is a DIFFERENT register from a
// diary line and has to read like one. A diary line is written in the evening
// about the day; a capture is written in the middle of the thing, in a hurry,
// and often about something that is not what you are doing.
export const DIARY_CAPTURES = [
  "The error message is the fix — just print the path it looked at",
  "Ask about the Tuesday deploy before it turns into a habit",
  "Book train tickets while they are still cheap",
  "Idea: fold the two settings pages into one and hide the second half",
  "Whoever named this variable owes me twenty minutes",
  "Check whether the old export path is still used by anyone",
  "The chapter I keep starting is the one I should skip",
  "Call back about the appointment",
  "It only fails on the second run, which means something is cached",
  "Write the release notes before the release, not after",
  "That phrase from the talk: 'make the change easy, then make the easy change'",
  "Milk, coffee, the good bread if they have it",
  "Draft an answer to the question everyone asks in onboarding",
  "Try the smaller font on the entry header and see if anyone notices",
  "Remember to actually take the afternoon off on Friday",
  "The bug is in the timezone, it is always in the timezone",
  "Ask whether anyone still reads the weekly summary",
  "Two words for the release notes: fewer, clearer",
  "The empty state is the first screen most people see — treat it like one",
  "Move the appointment, that week is already full",
  "Somebody should write down why we stopped doing it the other way",
  "Half the settings could be one setting with a better name",
  "Buy a card for Anna before the weekend",
  "If it needs a comment to be safe, it needs a test to stay safe",
];

// ── The events (4.62) ────────────────────────────────────────────────────
//
// The list the Meetings logbook reads, the calendars decorate with and the time
// grid draws — one store, four widgets, and every one of them was empty.
//
// DATES ARE OFFSETS, NOT DATES. An example vault whose only meeting was in
// March 2026 is a vault that looks abandoned the moment the year turns. The
// birthdays and holidays are annual and carry a real month and day; everything
// scheduled is written relative to the run's own "today", so the agenda always
// has something in it and the time grid always has a week to draw.
//
// ONE OF EACH SHAPE THE STORE CAN HOLD, deliberately: an annual birthday, a
// fixed holiday, a multi-day trip, single meetings with an hour and a length,
// and — new in 4.62 — a weekly one. A demo vault that exercised four of the five
// would leave the fifth undrawn in every screenshot taken from it.
export const SEED_EVENTS = [
  { title: "Anna's birthday", kind: "recurring", month: 4, day: 12, icon: "cake", color: "pink" },
  { title: "Dad's birthday", kind: "recurring", month: 9, day: 27, icon: "cake", color: "pink" },
  { title: "New Year's Day", kind: "recurring", month: 1, day: 1, icon: "party-popper", color: "amber" },
  { title: "Midsummer", kind: "recurring", month: 6, day: 24, icon: "sun", color: "amber" },
  {
    title: "Berlin, with the team",
    kind: "single",
    startOffset: 12,
    endOffset: 16,
    icon: "plane",
    color: "teal",
    note: "Flights booked, hotel not",
  },
  {
    title: "Week off",
    kind: "single",
    startOffset: -34,
    endOffset: -28,
    icon: "palm-tree",
    color: "green",
  },
  {
    title: "Stand-up",
    kind: "weekly",
    weekday: 3,
    time: "09:30",
    duration: 15,
    icon: "users",
    color: "blue",
    note: "Fifteen minutes, and it stays fifteen minutes",
  },
  {
    title: "Design review",
    kind: "single",
    startOffset: 1,
    time: "14:00",
    duration: 60,
    icon: "presentation",
    color: "purple",
  },
  {
    title: "One-to-one",
    kind: "single",
    startOffset: 2,
    time: "11:00",
    duration: 30,
    icon: "message-circle",
    color: "blue",
  },
  {
    title: "Dentist",
    kind: "single",
    startOffset: 4,
    time: "08:45",
    duration: 45,
    icon: "stethoscope",
    color: "red",
  },
  {
    title: "Release call",
    kind: "single",
    startOffset: 7,
    time: "16:00",
    duration: 45,
    icon: "rocket",
    color: "amber",
  },
  {
    title: "Dinner with Sam",
    kind: "single",
    startOffset: 3,
    time: "19:30",
    duration: 120,
    icon: "utensils",
    color: "green",
  },

  // ── THE PAST, WHICH THE OFFSETS ABOVE LEFT EMPTY (4.83) ────────────────
  //
  // Every scheduled event in this list used to sit within a fortnight of the
  // run's "today", because the list was written to make the AGENDA look alive.
  // It did — and it left a year of calendars with nothing on them but two
  // birthdays, so scrolling a demo vault back one month showed the month view
  // working and the person using it apparently doing nothing at all.
  //
  // These are the same shape with the sign reversed: far enough back to fill
  // the history, spaced so no month is bare, and each one the sort of thing you
  // would still be able to name a year later. They move with `--today` exactly
  // as the future ones do, so the history stays a history rather than becoming
  // an archive of early 2026.
  {
    title: "Moving day",
    kind: "single",
    startOffset: -337,
    endOffset: -336,
    icon: "truck",
    color: "amber",
    note: "Van booked for eight, keys back by six",
  },
  {
    title: "Winter conference",
    kind: "single",
    startOffset: -298,
    endOffset: -295,
    icon: "presentation",
    color: "purple",
  },
  {
    title: "Half marathon",
    kind: "single",
    startOffset: -244,
    time: "09:00",
    duration: 150,
    icon: "medal",
    color: "green",
  },
  {
    title: "Sarah and Tom's wedding",
    kind: "single",
    startOffset: -212,
    time: "13:00",
    duration: 480,
    icon: "heart",
    color: "pink",
  },
  {
    title: "Module exam",
    kind: "single",
    startOffset: -176,
    time: "09:30",
    duration: 180,
    icon: "graduation-cap",
    color: "red",
    note: "Stereochemistry and mechanisms",
  },
  {
    title: "Parents visiting",
    kind: "single",
    startOffset: -148,
    endOffset: -146,
    icon: "home",
    color: "teal",
  },
  {
    title: "Flu jab",
    kind: "single",
    startOffset: -121,
    time: "16:20",
    duration: 15,
    icon: "syringe",
    color: "red",
  },
  {
    title: "Team offsite",
    kind: "single",
    startOffset: -96,
    endOffset: -94,
    icon: "users",
    color: "blue",
    note: "Two days of planning and one of walking",
  },
  {
    title: "Car service",
    kind: "single",
    startOffset: -78,
    time: "08:00",
    duration: 30,
    icon: "car",
    color: "grey",
  },
  {
    title: "Spring release",
    kind: "single",
    startOffset: -63,
    time: "15:00",
    duration: 60,
    icon: "rocket",
    color: "amber",
  },
  {
    title: "Concert with Ben",
    kind: "single",
    startOffset: -41,
    time: "19:30",
    duration: 180,
    icon: "music",
    color: "purple",
  },
  {
    title: "Eye test",
    kind: "single",
    startOffset: -22,
    time: "11:15",
    duration: 30,
    icon: "eye",
    color: "teal",
  },
  {
    title: "Quarterly review",
    kind: "single",
    startOffset: -9,
    time: "10:00",
    duration: 90,
    icon: "clipboard-check",
    color: "blue",
  },
];

// ── The charts (4.62) ────────────────────────────────────────────────────
//
// Every scaffolded dashboard ships an EMPTY ```almanac-charts fence, so a
// freshly seeded vault had a year of tracker readings in it and not one chart
// drawn from them. This is the list that fills them.
//
// A PLAN, NOT DIRECTIVES. Each entry names a tracker, a type, a range and a
// title; the engine spells the `chart:` line and — this is the part that makes
// it a plan rather than a hardcoded string — DROPS any entry whose tracker the
// vault does not actually log, reporting it. A chart of a tracker with no
// readings is an empty tile, which is the thing this whole file exists to avoid.
//
// THE SURFACE DECIDES THE RANGE. A weekly dashboard charts `period` — its own
// week — and the homepage charts a year, because the question you ask on each is
// different: "how was this week" against "what has the year looked like". `key`
// is opaque and only has to be unique within its note.
export const DIARY_CHARTS = {
  home: [
    { key: "mood-year", tracker: "Mood", type: "month", range: "365", size: "wide", title: "Mood, the last year" },
    { key: "sleep-90", tracker: "Sleep", type: "line", range: "90", avg: true, title: "Sleep, last 90 days" },
    { key: "mood-all", tracker: "Mood", type: "summary", range: "all", title: "Mood at a glance" },
    { key: "energy-90", tracker: "Energy", type: "line", range: "90", avg: true, title: "Energy, last 90 days" },
    { key: "sleep-mood-90", tracker: "Sleep", type: "scatter", range: "90", y: "Mood", title: "Sleep against mood" },
  ],
  diary: [
    { key: "sleep-year", tracker: "Sleep", type: "line", range: "365", avg: true, size: "wide", title: "Sleep over the year" },
    { key: "sleep-mood", tracker: "Sleep", type: "scatter", range: "365", y: "Mood", title: "Does sleep move mood?" },
    { key: "day-shape", tracker: "Wake-Up", type: "line", range: "90", y: "Bedtime", title: "When the day starts and ends" },
    { key: "mood-heat", tracker: "Mood", type: "month", range: "365", title: "Mood" },
    { key: "focus-year", tracker: "Focus", type: "line", range: "365", avg: true, title: "Focus, when it was logged" },
    { key: "energy-sum", tracker: "Energy", type: "summary", range: "all", title: "Energy at a glance" },
    { key: "wake-sum", tracker: "Wake-Up", type: "summary", range: "365", title: "Wake-up over the year" },
  ],
  weekly: [
    { key: "mood-week", tracker: "Mood", type: "bar", range: "period", title: "Mood this week" },
    { key: "sleep-week", tracker: "Sleep", type: "line", range: "period", title: "Sleep this week" },
    { key: "sleep-sum", tracker: "Sleep", type: "summary", range: "period", title: "Sleep at a glance" },
    { key: "energy-week", tracker: "Energy", type: "bar", range: "period", title: "Energy this week" },
    { key: "day-shape-week", tracker: "Wake-Up", type: "line", range: "period", y: "Bedtime", title: "When the day started and ended" },
  ],
  monthly: [
    { key: "mood-month", tracker: "Mood", type: "month", range: "period", size: "wide", title: "Mood, day by day" },
    { key: "sleep-month", tracker: "Sleep", type: "line", range: "period", avg: true, title: "Sleep this month" },
    { key: "wake-month", tracker: "Wake-Up", type: "summary", range: "period", title: "Wake-up" },
    { key: "energy-month", tracker: "Energy", type: "line", range: "period", avg: true, title: "Energy this month" },
    { key: "sleep-mood-month", tracker: "Sleep", type: "scatter", range: "period", y: "Mood", title: "Sleep against mood, this month" },
  ],
  // ── A QUARTER AND A YEAR ARE BUCKETED, NOT DRAWN RAW ──────────────────
  //
  // `period` on the quarter note is ninety-two daily points and on the year note
  // three hundred and sixty-five, which is a line that reads as noise. That is
  // the case `daily-by-month` was added for — *"one point a month, out of
  // history that already exists"* — so the trends here take it and the calendar
  // keeps its raw days, because a heat map with one cell per month is not a
  // calendar.
  //
  // NO `+avg` ON A BUCKETED SERIES. The rolling average is what makes a dense
  // line legible; over twelve points it is the same line half a step late, and
  // over a quarter's three it is nothing at all.
  //
  // This scope could not be seeded until the grammar was fixed: the plugin
  // wrote `:daily-by-month` and its own `CHART_TAG` did not read it back, so a
  // chart carrying it vanished on the next parse. `test/pure-logic.test.ts` now
  // asserts the serialiser and the parser agree over every scope, and
  // `test/seed-vault.test.ts` asserts every spec in this file survives the round
  // trip — the pair is what makes it safe to write one here.
  quarterly: [
    { key: "mood-cal-q", tracker: "Mood", type: "month", range: "period", size: "wide", title: "Mood, day by day" },
    { key: "mood-quarter", tracker: "Mood", type: "line", range: "period", avg: true, title: "Mood across the quarter" },
    { key: "sleep-quarter", tracker: "Sleep", type: "line", range: "period", scope: "daily-by-month", title: "Sleep, month by month" },
    { key: "mood-sum-q", tracker: "Mood", type: "summary", range: "period", title: "Mood at a glance" },
    { key: "energy-quarter", tracker: "Energy", type: "bar", range: "period", scope: "daily-by-month", title: "Energy, month by month" },
  ],
  yearly: [
    { key: "mood-cal", tracker: "Mood", type: "month", range: "period", size: "large", title: "Mood, the whole year" },
    { key: "sleep-yearline", tracker: "Sleep", type: "line", range: "period", scope: "daily-by-month", title: "Sleep, month by month" },
    { key: "sleep-sum-y", tracker: "Sleep", type: "summary", range: "period", title: "Sleep at a glance" },
    { key: "mood-yearline", tracker: "Mood", type: "line", range: "period", scope: "daily-by-month", title: "Mood, month by month" },
    { key: "wake-sum-y", tracker: "Wake-Up", type: "summary", range: "period", title: "Wake-up at a glance" },
  ],
  // ── THE JOURNALS DASHBOARD, WHICH NOTHING FILLED (4.83) ────────────────
  //
  // `03 - Journals` ships the same empty `almanac-charts` fence the five diary
  // pages do — `journals-dashboard-sections.ts` says so in as many words: *"The
  // diary's chart fence, not a journal dashboard's … This page sits above every
  // journal rather than inside one, so it takes the former."* The seeder filled
  // the other six surfaces and left this one, so the demo vault's journals page
  // has shown an empty chart manager since the fence was added.
  //
  // DIARY TRACKERS ON A JOURNALS PAGE IS NOT A CATEGORY ERROR: the question the
  // page asks is "how has the work been going", and Focus and Energy are the two
  // readings in the vault that answer it. The journal's OWN quantities are
  // charted by `jchart:` on the journal's own dashboard, which is a different
  // fence reading a different store.
  journals: [
    { key: "focus-90", tracker: "Focus", type: "line", range: "90", avg: true, size: "wide", title: "Focus, last 90 days" },
    { key: "energy-focus", tracker: "Energy", type: "scatter", range: "365", y: "Focus", title: "Energy against focus" },
    { key: "focus-sum", tracker: "Focus", type: "summary", range: "365", title: "Focus at a glance" },
  ],
};

// Which list fills which logbook, keyed by the id in the vault's settings —
// the same arrangement `CORPUS` uses for journals, and for the same reason: a
// vault that renames "Work log" still has a `work` book, and a vault that adds
// one gets a warning rather than a silently empty note.
//
// `mins` SAYS WHETHER THE BOOK'S ITEMS TOOK TIME. A work log adds up and draws
// on the grid as blocks; a change of focus and a link to come back to are
// moments — they happened at a minute and took none. That distinction is
// `LogItem.mins`' whole reason for being null rather than zero, so the seed has
// to make it rather than giving everything a plausible-looking duration.
export const LOGBOOK_CORPUS = {
  work: { lines: WORK_LOG, mins: true, perDay: 0.45, crossOff: 0 },
  focus: { lines: FOCUS_LOG, mins: false, spread: true, crossOff: 0 },
  review: { lines: REVIEW_LINKS, mins: false, spread: true, crossOff: 0.5 },
};

// Content for period entries (weeks, months, quarters, years)
export const PERIOD_CORPUS = {
  weekly: {
    focus: [
      "Ship the core architecture refactoring and establish stable foundations.",
      "Deep focus on study materials, chemistry problem sets, and revision.",
      "Consolidate daily habit tracking and keep circadian rhythm aligned.",
      "Wrap up active sprint backlog tasks and plan incoming quarter objectives.",
      "Prioritize recovery, rest days, and consistent sleep hygiene.",
      "Execute high-leverage project milestones and refine documentation.",
      "Get the week's hard thing done by Wednesday, not on Friday afternoon.",
      "Fewer open threads at the end of the week than at the start.",
      "Protect two long focus blocks a day and let the rest be admin.",
      "Catch up on the reading that has been sliding for a fortnight.",
      "Train three times without making the fourth a guilt trip.",
      "Close the loop on everything still open from last week.",
    ],
    highlights: [
      "Completed 100% of planned study objectives and lab notes.",
      "Hit consecutive daily journaling and sleep tracking streak.",
      "Successfully drafted and reviewed system architecture notes.",
      "Cleared active staging inbox and consolidated references.",
      "Maintained consistent morning workouts and evening reviews.",
      "Made great breakthrough on chemistry problem sets.",
      "Three clean training sessions and no aches to show for them.",
      "Finished the week with an empty inbox and no open branches.",
      "Wrote something on Tuesday that still read well on Friday.",
      "Two long focus blocks a day, most days, without defending them.",
      "Said no to a piece of work that would have eaten the week.",
    ],
    challenges: [
      "Context switching between multiple tasks reduced focus on Thursday.",
      "Late evening work session impacted next morning's wake-up time.",
      "Unexpected interruptions delayed planned review session.",
      "Two poor nights midweek and everything after them was slower.",
      "Started the week without a plan and spent Monday making one.",
      "The admin pile grew faster than I cleared it.",
      "Left the hardest task until Friday, again.",
    ],
    review: [
      "Pacing was consistent throughout the week; energy levels peaked midweek.",
      "Morning routine supported deep focus blocks without distraction.",
      "Good balance between analytical work and restorative downtime.",
      "Fewer context switches this week led to higher quality outputs.",
      "The week ran on the mornings; the afternoons were mostly admin.",
      "Sleep held steady and so did everything that depends on it.",
      "Too much started, not enough finished — worth watching next week.",
      "A quiet week, and quiet weeks are where the backlog actually shrinks.",
    ],
    tasks: [
      "Review sprint goals and check progress against milestones",
      "Archive processed staging notes and update indexes",
      "Prepare study deck for upcoming module review",
      "Audit weekly tracker trends and sleep averages",
      "Write the week's summary while it is still fresh",
      "Clear the review queue down to nothing",
      "Plan next week's two hard tasks before Sunday evening",
      "Tidy the staging folder and file what is worth keeping",
    ],
  },
  monthly: {
    focus: [
      "Consistent academic momentum and disciplined morning focus routines.",
      "Establish deep mastery of core principles and active recall practice.",
      "Consolidate personal knowledge base and streamline note linking.",
      "Fewer projects, further along — no new commitments this month.",
      "Rebuild the training base after the layoff, slowly.",
      "Finish the two things carried over rather than starting a third.",
    ],
    summary: [
      "A productive month marked by steady execution across core study topics and consistent daily logging.",
      "Solid habit momentum maintained across all four weeks, with clear progress on major milestones.",
      "Balanced focus between deep academic study and structured personal project development.",
      "Great consolidation period; established dependable daily rhythms and clear next steps.",
    ],
    highlights: [
      "Maintained over 85% habit consistency across all tracked metrics.",
      "Completed full revision of organic chemistry stereochemistry lessons.",
      "Streamlined note taxonomy and improved dashboard glanceability.",
      "Four unbroken weeks of logging, including the difficult one.",
      "Shipped the thing that had been three weeks from done since spring.",
      "Sleep average up half an hour on last month, and it showed.",
    ],
    challenges: [
      "Mid-month travel caused a minor dip in sleep consistency.",
      "Balancing multiple project deadlines required proactive prioritization.",
    ],
    reflections: [
      "Consistent small daily efforts compound noticeably across four weeks.",
      "Protecting morning focus blocks made the biggest difference in weekly throughput.",
      "Clear boundaries around evening wind-down improved overall sleep quality and readiness.",
      "Looking forward to building on this foundation for the upcoming month.",
    ],
  },
  quarterly: {
    focus: [
      "Broad foundational mastery and system consolidation.",
      "High-output project execution and health habit optimization.",
    ],
    objectives: [
      "Master foundational subject areas and compile comprehensive study decks.",
      "Achieve dependable daily tracking coverage and analyze sleep/mood trends.",
      "Complete major project deliverables and streamline personal knowledge base.",
      "Cultivate sustainable work-rest balance and maintain steady habit streaks.",
    ],
    highlights: [
      "Successfully delivered all planned quarterly milestones ahead of schedule.",
      "Documented clear correlations between sleep quality and daily focus ratings.",
      "Organized knowledge base with clear hierarchical separation and clean graph topology.",
    ],
    challenges: [
      "Managing peak workload periods without compromising sleep hygiene.",
    ],
    review: [
      "High level of goal completion across all target areas; strong consistency.",
      "Trends and charts demonstrate positive correlation between consistent sleep and focus.",
      "Successfully transitioned ideas from staging to structured long-term notes.",
      "Quarterly milestones accomplished on schedule with minimal friction.",
    ],
  },
  yearly: {
    focus: [
      "Cultivating enduring mastery, lifelong learning, and systematic habit excellence.",
    ],
    highlights: [
      "Completed comprehensive study curricula with 100% active recall coverage.",
      "Maintained unbroken year-long streak of reflection and data tracking.",
      "Transformed personal workflow into a calm, reliable, and expressive system.",
    ],
    retrospective: [
      "A transformative year of structured learning, deep journaling, and habit cultivation.",
      "Built an enduring body of knowledge across multiple disciplines with rich interlinking.",
      "Maintained high fidelity diary coverage and gained invaluable insights from temporal trends.",
      "Established clear personal systems that make steady progress enjoyable and automatic.",
    ],
  },
};
