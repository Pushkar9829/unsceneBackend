const connectDb = require("../config/db");
const Genre = require("../modules/genre/genre.model");

const DEFAULT_GENRES = [
  "Romance",
  "Comedy",
  "Mystery",
  "Horror",
  "Thriller",
  "Sci-Fi",
];

const normalizeName = (name) => String(name || "").trim().toLowerCase();

const seedGenres = async () => {
  await connectDb();

  const ops = DEFAULT_GENRES.map((name) => {
    const trimmed = String(name).trim();
    const normalizedName = normalizeName(trimmed);
    return {
      updateOne: {
        filter: { normalizedName },
        update: {
          $set: {
            name: trimmed,
            normalizedName,
            isActive: true,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await Genre.bulkWrite(ops, { ordered: false });
  console.log("Genres seeded", {
    inserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
  });

  process.exit(0);
};

seedGenres().catch((error) => {
  console.error("Failed to seed genres", error);
  process.exit(1);
});
