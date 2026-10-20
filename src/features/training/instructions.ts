import type { Instructions } from "./catalog.ts";

export const INSTRUCTIONS: Readonly<Record<string, Instructions>> = {
  "wpullup": {
    "start": "Hang from the bar with hands just outside shoulder width, weight hanging from a belt or held between your feet.",
    "move": "Set your shoulders down first, then drive your elbows towards your back pockets until your chin clears the bar.",
    "ret": "Lower under control all the way to a full dead hang.",
    "tips": "No kipping or swinging. When reps slow right down, the set is done."
  },
  "latpd": {
    "start": "Sit with your thighs locked under the pad and grip the bar just outside shoulder width.",
    "move": "Pull the bar to your upper chest, driving your elbows down and back.",
    "ret": "Let the bar rise slowly to a full stretch overhead.",
    "tips": "Stay upright. Leaning back to finish the rep means the weight is too heavy."
  },
  "wdip": {
    "start": "Support yourself at lockout on the bars with weight hanging from a belt, shoulders pulled down away from your ears.",
    "move": "Lean slightly forward and lower until your shoulders are just below your elbows.",
    "ret": "Press back up to a full lockout.",
    "tips": "Stop the descent if your shoulders roll forward or pinch. Depth you can control beats depth you can’t."
  },
  "bench": {
    "start": "Lie on the bench with feet planted, shoulder blades pinched and a grip slightly wider than your shoulders.",
    "move": "Lower the bar to mid-chest with your forearms vertical.",
    "ret": "Press up and slightly back so the bar finishes over your shoulders.",
    "tips": "Keep your glutes on the bench and your upper back tight throughout."
  },
  "bbrow": {
    "start": "Hold the bar at hip height, then hinge to about 45 degrees with a flat back and soft knees.",
    "move": "Row the bar to your lower ribs and squeeze your shoulder blades together.",
    "ret": "Lower to straight arms without letting your torso rise.",
    "tips": "If you need momentum to move it, the weight is too heavy."
  },
  "lawnrow": {
    "start": "One hand and knee on a bench, dumbbell in the other hand, back flat.",
    "move": "Pull the dumbbell to your hip, keeping your elbow close to your side.",
    "ret": "Lower to a full stretch at the bottom.",
    "tips": "Keep your torso square. Don’t twist to lift more."
  },
  "incdb": {
    "start": "Sit on an incline bench set at 30 to 45 degrees, holding a dumbbell in each hand at chest level, palms facing forward.",
    "move": "Slowly lower your elbows just below your shoulders to stretch your upper chest.",
    "ret": "Press the dumbbells back up and slightly in over your shoulders.",
    "tips": "Keep your elbows under your wrists and your ribs down. Avoid a big arch in your back."
  },
  "incpush": {
    "start": "Hands on a box or bench just wider than your shoulders, body in one straight line.",
    "move": "Lower until your chest touches the edge.",
    "ret": "Press away to straight arms.",
    "tips": "Squeeze your glutes and brace so your hips don’t sag."
  },
  "pushup": {
    "start": "Hands under your shoulders, body in one straight line from head to heels.",
    "move": "Lower until your chest is a fist from the floor.",
    "ret": "Press back to straight arms.",
    "tips": "Elbows at about 45 degrees from your body, not flared wide."
  },
  "pushemom": {
    "start": "Hands under your shoulders, body in one straight line from head to heels.",
    "move": "Lower until your chest is a fist from the floor.",
    "ret": "Press back to straight arms.",
    "tips": "Finish the reps as soon as the minute starts, then rest for whatever’s left of it."
  },
  "pullemom": {
    "start": "Hang from the bar, hands just outside shoulder width.",
    "move": "Pull until your chin clears the bar.",
    "ret": "Lower to a full hang.",
    "tips": "Strict reps only. Rest the remainder of the minute."
  },
  "pullup": {
    "start": "Hang from the bar, hands just outside shoulder width.",
    "move": "Set your shoulders down, then pull until your chin clears the bar.",
    "ret": "Lower under control to a full hang.",
    "tips": "No kipping. Quality reps over quantity."
  },
  "dip": {
    "start": "Support yourself at lockout on the bars, shoulders down.",
    "move": "Lean slightly forward and lower until your shoulders are just below your elbows.",
    "ret": "Press back to a full lockout.",
    "tips": "Control the bottom. Stop short of any shoulder pinch."
  },
  "dbpress": {
    "start": "Dumbbells at shoulder height, palms forward, ribs down and core braced.",
    "move": "Press overhead until your arms are straight and in line with your ears.",
    "ret": "Lower back to shoulder height under control.",
    "tips": "Don’t lean back to finish the rep."
  },
  "landpress": {
    "start": "Stand holding the end of the landmine bar at shoulder height with one hand.",
    "move": "Press up and forward until your arm is straight.",
    "ret": "Lower back to your shoulder slowly.",
    "tips": "Brace your core and keep your hips square."
  },
  "lateral": {
    "start": "Stand with a dumbbell in each hand at your sides, slight bend in the elbows.",
    "move": "Raise out to the sides, leading with your elbows, up to shoulder height.",
    "ret": "Lower slowly back to your sides.",
    "tips": "Go light enough that you never swing. Stop at shoulder height."
  },
  "cablelat": {
    "start": "Stand side-on to a low cable, handle in the far hand.",
    "move": "Raise out to the side, leading with your elbow, to shoulder height.",
    "ret": "Lower slowly against the cable.",
    "tips": "Keep your torso still. The cable keeps tension on the whole rep."
  },
  "curl": {
    "start": "Stand facing a low cable, elbows pinned to your sides.",
    "move": "Curl the handle up and squeeze at the top.",
    "ret": "Lower slowly to a full stretch.",
    "tips": "Elbows stay fixed. If they drift forward, drop the weight."
  },
  "dbcurl": {
    "start": "Stand with a dumbbell in each hand, elbows at your sides.",
    "move": "Curl up, turning your palms to face you, and squeeze.",
    "ret": "Lower slowly to straight arms.",
    "tips": "No swinging from the hips."
  },
  "pushdown": {
    "start": "Face a high cable with a rope, elbows pinned to your sides.",
    "move": "Push down and spread the rope at the bottom.",
    "ret": "Let it rise under control until your forearms are just past parallel.",
    "tips": "Only your forearms move."
  },
  "ohext": {
    "start": "Hold a dumbbell or rope overhead, elbows pointing forward.",
    "move": "Lower behind your head to a deep stretch.",
    "ret": "Extend back to straight arms.",
    "tips": "Keep your elbows in and your ribs down."
  },
  "reardelt": {
    "start": "Hinge forward with a flat back and a light dumbbell in each hand, soft elbows.",
    "move": "Open your arms wide and squeeze your upper back.",
    "ret": "Lower under control.",
    "tips": "Light weight, slow reps. Feel the back of your shoulders, not your traps."
  },
  "facepull": {
    "start": "Rope on a cable at head height, arms straight, step back.",
    "move": "Pull towards your face, elbows high, hands finishing beside your ears.",
    "ret": "Return slowly to straight arms.",
    "tips": "Pause at the back of every rep."
  },
  "squat": {
    "start": "Bar across your upper back, feet shoulder width, brace your core.",
    "move": "Sit down between your hips with your knees tracking over your toes.",
    "ret": "Drive up through your whole foot to standing.",
    "tips": "Brace before every rep. Depth you can control with a neutral back."
  },
  "goblet": {
    "start": "Hold a dumbbell or kettlebell at your chest, elbows pointing down.",
    "move": "Sit down between your knees, chest up.",
    "ret": "Drive up through your whole foot.",
    "tips": "Let your elbows brush the inside of your knees at the bottom."
  },
  "rdl": {
    "start": "Stand tall holding the bar at your hips, soft knees.",
    "move": "Push your hips back and lower the bar close to your legs over three seconds.",
    "ret": "Drive your hips forward to stand tall.",
    "tips": "Stop when your hamstrings are stretched and your back is still flat. That’s your range."
  },
  "dbrdl": {
    "start": "Stand holding dumbbells at your thighs, soft knees.",
    "move": "Push your hips back, dumbbells close to your legs.",
    "ret": "Drive your hips forward to stand.",
    "tips": "Flat back throughout. Slow on the way down."
  },
  "lunge": {
    "start": "Stand tall with dumbbells at your sides.",
    "move": "Take a long step and lower your back knee towards the floor.",
    "ret": "Drive through your front heel into the next step.",
    "tips": "Front knee over your foot, torso upright."
  },
  "splitsq": {
    "start": "Split stance, back foot on its toes, weight in the front foot.",
    "move": "Lower your back knee straight down towards the floor.",
    "ret": "Drive up through your front foot.",
    "tips": "All reps one side, then switch."
  },
  "legcurl": {
    "start": "Set up on the machine with the pad just above your heels, hips pressed down.",
    "move": "Curl your heels towards your glutes and squeeze.",
    "ret": "Lower slowly to straight legs.",
    "tips": "Keep your hips on the pad."
  },
  "nordic": {
    "start": "Kneel with your ankles anchored, body upright.",
    "move": "Lower your body forward as slowly as you can.",
    "ret": "Catch yourself with your hands and push back up.",
    "tips": "Control the lowering. That’s where the work is."
  },
  "calf": {
    "start": "Balls of your feet on a step, heels hanging off.",
    "move": "Rise as high as you can onto your big toes.",
    "ret": "Lower to a deep stretch and pause.",
    "tips": "Pause at the top and bottom. No bouncing."
  },
  "steady": {
    "start": "Pick your cardio: bike, rower, incline walk or run.",
    "move": "Hold a pace you could talk at.",
    "ret": "Ease down for the last few minutes.",
    "tips": "This builds your engine without costing recovery."
  },
  "interval": {
    "start": "Warm up for five minutes.",
    "move": "Work hard for the interval, then recover fully.",
    "ret": "Repeat for the time set.",
    "tips": "Every work bout should be as strong as the first."
  },
  "upmob": {
    "start": "Clear some floor space and a bar to hang from.",
    "move": "Work through each drill slowly.",
    "ret": "Breathe out into the end of each range.",
    "tips": "Mobility is never painful. Ease off if it is."
  },
  "lowmob": {
    "start": "Clear some floor space.",
    "move": "Work through each drill slowly.",
    "ret": "Breathe out into the end of each range.",
    "tips": "Mobility is never painful. Ease off if it is."
  }
};

export const MASTER_CUES: Readonly<Record<string, string>> = {
  "wpullup": "Drive your elbows into your back pockets.",
  "latpd": "Drive your elbows into your back pockets.",
  "wdip": "Push the bars away from you.",
  "bench": "Push yourself away from the bar.",
  "bbrow": "Bar to your belly button, elbows back.",
  "lawnrow": "Elbow to your back pocket.",
  "incdb": "Elbows stay under your wrists.",
  "incpush": "Push the box away.",
  "pushup": "Push the floor away.",
  "pushemom": "Push the floor away.",
  "pullemom": "Chest to the bar.",
  "pullup": "Chest to the bar.",
  "dip": "Push the bars down to the floor.",
  "dbpress": "Punch the ceiling.",
  "landpress": "Punch up and forward.",
  "lateral": "Feel the side of your shoulder lift the weight.",
  "cablelat": "Feel the side of your shoulder lift the handle.",
  "curl": "Squeeze your biceps to the top.",
  "dbcurl": "Squeeze your biceps to the top.",
  "pushdown": "Squeeze the back of your arms hard at the bottom.",
  "ohext": "Feel the stretch in the back of your arms.",
  "reardelt": "Feel the back of your shoulders pull the weight.",
  "facepull": "Squeeze your upper back together.",
  "squat": "Spread the floor with your feet.",
  "goblet": "Sit down between your heels.",
  "rdl": "Push your hips back to the wall behind you.",
  "dbrdl": "Push your hips back to the wall behind you.",
  "lunge": "Drop your back knee straight down.",
  "splitsq": "Drop your back knee straight down.",
  "legcurl": "Squeeze your hamstrings to curl the weight.",
  "nordic": "Fall as slowly as you can.",
  "calf": "Squeeze your calves hard at the top.",
  "steady": "Easy enough to talk.",
  "interval": "Every effort as strong as the first.",
  "upmob": "Breathe out into the stretch.",
  "lowmob": "Breathe out into the stretch."
};
