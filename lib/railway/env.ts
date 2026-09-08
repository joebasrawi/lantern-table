import { db, bucket } from './storage';
export const env = {
  DB: db,
  get OPENAI_IMAGE_MODEL() {
    return process.env.OPENAI_IMAGE_MODEL;
  },
  get LANTERN_PORTRAITS_ENABLED() {
    return process.env.LANTERN_PORTRAITS_ENABLED;
  },
  get LANTERN_PORTRAIT_DAILY_LIMIT() {
    return process.env.LANTERN_PORTRAIT_DAILY_LIMIT;
  },
  PORTRAITS: bucket,
  get OPENAI_API_KEY() {
    return process.env.OPENAI_API_KEY;
  },
  get LANTERN_AI_DAILY_LIMIT() {
    return process.env.LANTERN_AI_DAILY_LIMIT;
  },
  get OPENAI_MODEL() {
    return process.env.OPENAI_MODEL;
  },
};
