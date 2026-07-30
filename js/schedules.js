// js/schedules.js
// -----------------------------------------------------------------------
// There is no free, universal API that returns a manufacturer's exact
// maintenance schedule for an arbitrary VIN/year/make/model. Instead this
// file ships a well-established set of *generic, industry-standard*
// interval templates (the kind found in most owner's manuals), grouped by
// drivetrain/vehicle class. When a vehicle is added, GearLog seeds its
// task list from the closest matching template so the user has a
// realistic starting point, then the user edits/removes/adds tasks to
// match their actual owner's manual. This file is the single place to
// extend or correct those defaults.
// -----------------------------------------------------------------------

export const VEHICLE_CLASSES = [
  { id: "gas-standard", label: "Gasoline car / SUV (standard oil)" },
  { id: "gas-synthetic", label: "Gasoline car / SUV (full synthetic oil)" },
  { id: "truck-suv-heavy", label: "Truck / heavy SUV / tow-rated" },
  { id: "diesel", label: "Diesel truck / SUV" },
  { id: "hybrid", label: "Hybrid" },
  { id: "ev", label: "Electric vehicle (EV)" },
  { id: "motorcycle", label: "Motorcycle" },
];

// Each task: name, category, intervalMiles, intervalMonths, notes (default)
// A null interval means "inspect / as needed" rather than a fixed schedule.
const BASE_CAR = [
  { name: "Engine oil & filter change", category: "Engine", intervalMiles: 5000, intervalMonths: 6,
    notes: "Interval assumes conventional oil under normal driving. Adjust to your owner's manual." },
  { name: "Tire rotation", category: "Tires", intervalMiles: 6000, intervalMonths: 6, notes: "" },
  { name: "Tire pressure & tread check", category: "Tires", intervalMiles: 3000, intervalMonths: 1, notes: "Check when tires are cold." },
  { name: "Engine air filter", category: "Engine", intervalMiles: 15000, intervalMonths: 12, notes: "" },
  { name: "Cabin air filter", category: "HVAC", intervalMiles: 15000, intervalMonths: 12, notes: "" },
  { name: "Brake fluid flush", category: "Brakes", intervalMiles: 30000, intervalMonths: 24, notes: "" },
  { name: "Brake pad & rotor inspection", category: "Brakes", intervalMiles: 10000, intervalMonths: 12, notes: "" },
  { name: "Coolant / antifreeze service", category: "Cooling", intervalMiles: 60000, intervalMonths: 60, notes: "" },
  { name: "Transmission fluid service", category: "Drivetrain", intervalMiles: 60000, intervalMonths: 60, notes: "Interval varies widely by transmission type - verify with manual." },
  { name: "Spark plugs", category: "Engine", intervalMiles: 60000, intervalMonths: 72, notes: "Longer for iridium/platinum plugs - check manual." },
  { name: "Battery test", category: "Electrical", intervalMiles: 12000, intervalMonths: 12, notes: "" },
  { name: "Wiper blades", category: "Exterior", intervalMiles: null, intervalMonths: 12, notes: "Replace sooner if streaking/chattering." },
  { name: "Serpentine/drive belt inspection", category: "Engine", intervalMiles: 30000, intervalMonths: 36, notes: "" },
  { name: "Alignment check", category: "Tires", intervalMiles: null, intervalMonths: 12, notes: "Also after hitting a pothole/curb." },
  { name: "Fuel filter (if serviceable)", category: "Engine", intervalMiles: 30000, intervalMonths: 36, notes: "Many modern vehicles have a lifetime in-tank filter - verify applicability." },
];

const SYNTHETIC_OVERRIDES = {
  "Engine oil & filter change": { intervalMiles: 7500, intervalMonths: 12,
    notes: "Interval assumes full synthetic oil under normal driving. Adjust to your owner's manual." },
};

const TRUCK_ADDITIONS = [
  { name: "Differential fluid service", category: "Drivetrain", intervalMiles: 30000, intervalMonths: 36, notes: "Front and rear if 4WD/AWD." },
  { name: "Transfer case fluid (4WD)", category: "Drivetrain", intervalMiles: 30000, intervalMonths: 36, notes: "" },
  { name: "Bed/hitch & tow equipment check", category: "Towing", intervalMiles: null, intervalMonths: 6, notes: "" },
];

const DIESEL_ADDITIONS = [
  { name: "Fuel/water separator drain", category: "Engine", intervalMiles: 5000, intervalMonths: 6, notes: "" },
  { name: "Diesel fuel filter replacement", category: "Engine", intervalMiles: 15000, intervalMonths: 12, notes: "" },
  { name: "DEF fluid top-off", category: "Emissions", intervalMiles: 5000, intervalMonths: 3, notes: "" },
];

const HYBRID_ADDITIONS = [
  { name: "Hybrid battery coolant service", category: "Electrical", intervalMiles: 100000, intervalMonths: 60, notes: "" },
  { name: "Hybrid battery health check", category: "Electrical", intervalMiles: 30000, intervalMonths: 24, notes: "" },
];

const EV_TASKS = [
  { name: "Tire rotation", category: "Tires", intervalMiles: 6000, intervalMonths: 6, notes: "EVs often wear tires faster due to instant torque." },
  { name: "Tire pressure & tread check", category: "Tires", intervalMiles: 3000, intervalMonths: 1, notes: "" },
  { name: "Brake fluid flush", category: "Brakes", intervalMiles: 30000, intervalMonths: 24, notes: "" },
  { name: "Brake pad & rotor inspection", category: "Brakes", intervalMiles: 15000, intervalMonths: 12, notes: "Regenerative braking usually extends pad life - still worth a look." },
  { name: "Cabin air filter", category: "HVAC", intervalMiles: 15000, intervalMonths: 12, notes: "" },
  { name: "12V auxiliary battery check", category: "Electrical", intervalMiles: 20000, intervalMonths: 24, notes: "" },
  { name: "Coolant loop service (battery/motor)", category: "Cooling", intervalMiles: 60000, intervalMonths: 60, notes: "Verify with manufacturer - intervals vary a lot by model." },
  { name: "Wiper blades", category: "Exterior", intervalMiles: null, intervalMonths: 12, notes: "" },
  { name: "Alignment check", category: "Tires", intervalMiles: null, intervalMonths: 12, notes: "" },
];

const MOTORCYCLE_TASKS = [
  { name: "Engine oil & filter change", category: "Engine", intervalMiles: 3000, intervalMonths: 6, notes: "" },
  { name: "Chain clean & lube", category: "Drivetrain", intervalMiles: 500, intervalMonths: 1, notes: "Belt/shaft drive bikes can skip this." },
  { name: "Chain slack/wear check", category: "Drivetrain", intervalMiles: 2000, intervalMonths: 3, notes: "" },
  { name: "Valve clearance check", category: "Engine", intervalMiles: 16000, intervalMonths: 24, notes: "Interval varies a lot by engine design." },
  { name: "Tire pressure & tread check", category: "Tires", intervalMiles: 1000, intervalMonths: 1, notes: "" },
  { name: "Brake fluid flush", category: "Brakes", intervalMiles: 20000, intervalMonths: 24, notes: "" },
  { name: "Brake pad inspection", category: "Brakes", intervalMiles: 4000, intervalMonths: 6, notes: "" },
  { name: "Coolant service (liquid-cooled)", category: "Cooling", intervalMiles: 24000, intervalMonths: 24, notes: "" },
  { name: "Air filter", category: "Engine", intervalMiles: 8000, intervalMonths: 12, notes: "" },
  { name: "Battery terminal check", category: "Electrical", intervalMiles: null, intervalMonths: 6, notes: "" },
];

function withOverrides(base, overrides) {
  return base.map((t) => (overrides[t.name] ? { ...t, ...overrides[t.name] } : { ...t }));
}

export function getTemplate(classId) {
  switch (classId) {
    case "gas-standard":
      return BASE_CAR.map((t) => ({ ...t }));
    case "gas-synthetic":
      return withOverrides(BASE_CAR, SYNTHETIC_OVERRIDES);
    case "truck-suv-heavy":
      return [...withOverrides(BASE_CAR, SYNTHETIC_OVERRIDES), ...TRUCK_ADDITIONS.map((t) => ({ ...t }))];
    case "diesel":
      return [...withOverrides(BASE_CAR, SYNTHETIC_OVERRIDES), ...TRUCK_ADDITIONS.map((t) => ({ ...t })), ...DIESEL_ADDITIONS.map((t) => ({ ...t }))];
    case "hybrid":
      return [...BASE_CAR.map((t) => ({ ...t })), ...HYBRID_ADDITIONS.map((t) => ({ ...t }))];
    case "ev":
      return EV_TASKS.map((t) => ({ ...t }));
    case "motorcycle":
      return MOTORCYCLE_TASKS.map((t) => ({ ...t }));
    default:
      return BASE_CAR.map((t) => ({ ...t }));
  }
}
