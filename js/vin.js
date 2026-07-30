// js/vin.js
// Uses NHTSA's free, public vPIC API to decode a VIN into year/make/model.
// This is real vehicle-registry data (no API key required), but it does NOT
// include manufacturer maintenance schedules - NHTSA has no such dataset.
// https://vpic.nhtsa.dot.gov/api/

export async function decodeVin(vin) {
  const clean = (vin || "").trim().toUpperCase();
  if (clean.length !== 17) {
    throw new Error("VIN must be exactly 17 characters.");
  }
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(clean)}?format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`VIN lookup failed (${res.status}).`);
  const data = await res.json();
  const row = data && data.Results && data.Results[0];
  if (!row) throw new Error("No data returned for that VIN.");
  if (row.ErrorCode && row.ErrorCode !== "0") {
    // NHTSA still returns partial data even with a non-zero error code sometimes;
    // only hard-fail if nothing useful came back.
    if (!row.Make && !row.Model) {
      throw new Error(row.ErrorText || "VIN could not be decoded.");
    }
  }
  return {
    vin: clean,
    year: row.ModelYear || "",
    make: row.Make || "",
    model: row.Model || "",
    trim: row.Trim || "",
    bodyClass: row.BodyClass || "",
    fuelType: row.FuelTypePrimary || "",
    driveType: row.DriveType || "",
    engine: [row.EngineCylinders && `${row.EngineCylinders}cyl`, row.DisplacementL && `${row.DisplacementL}L`]
      .filter(Boolean)
      .join(" "),
  };
}
