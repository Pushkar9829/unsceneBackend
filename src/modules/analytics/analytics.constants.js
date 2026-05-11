/** Allowed analytics event types (spec §2.1). */
const ANALYTICS_EVENT_TYPES = Object.freeze([
  "series.view",
  "series.favorite.add",
  "series.favorite.remove",
  "episode.play.start",
  "episode.play.progress",
  "episode.play.complete",
  "episode.pause",
  "episode.resume",
  "product_cue.impression",
  "product_cue.click",
]);

module.exports = {
  ANALYTICS_EVENT_TYPES,
};
