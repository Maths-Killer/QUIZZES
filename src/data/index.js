/**
 * data/index.js — Aggregates every bundled topic module into one array.
 *
 * To add a new topic at any scale (this pattern holds fine up to 5,000+
 * questions since each topic file is independently sized and Vite tree-
 * shakes/bundles statically): create a new file in ./topics/, export a
 * topic object matching the shape below, then add it to ALL_TOPICS here.
 */

import { pathologyTopic } from './topics/pathology.js';
import { cardiologyTopic } from './topics/cardiology.js';

export const ALL_TOPICS = [pathologyTopic, cardiologyTopic];
