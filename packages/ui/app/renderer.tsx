import { jsxRenderer } from 'hono/jsx-renderer';
import Layout from './layout';

export const renderer = jsxRenderer(
  ({ children, title }) => {
    return <Layout title={title}>{children}</Layout>;
  },
  {
    docType: false
  }
);
