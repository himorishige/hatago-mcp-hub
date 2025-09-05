import { Hono } from 'hono';
import { renderer } from './renderer';

const app = new Hono();

app.use(renderer);

export default app;
