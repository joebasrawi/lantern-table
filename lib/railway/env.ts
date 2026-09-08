import { db, bucket } from './storage';
export const env = {
  DB: db,
  PORTRAITS: bucket,
  get OPENAI_API_KEY() {
    return process.env.OPENAI_API_KEY;
  },
  get OPENAI_MODEL() {
    return process.env.OPENAI_MODEL;
  },
};
