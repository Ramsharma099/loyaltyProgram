import {defineConfig, loadEnv} from 'vite';
import {hydrogen} from '@shopify/hydrogen/vite';
import {oxygen} from '@shopify/mini-oxygen/vite';
import {reactRouter} from '@react-router/dev/vite';
import {fileURLToPath} from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

function pickDefinedEnv(env, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => env[key] !== undefined)
      .map((key) => [key, env[key]]),
  );
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, projectRoot, '');
  const oxygenEnv = pickDefinedEnv(env, [
    'LOYALTY_APP_URL',
    'HYDROGEN_LOYALTY_API_TOKEN',
    'LOYALTY_HYDROGEN_API_TOKEN',
    'PUBLIC_STORE_DOMAIN',
    'SHOP_ID',
  ]);

  return {
    plugins: [hydrogen(), oxygen({env: oxygenEnv}), reactRouter()],
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('./app', import.meta.url)),
      },
      tsconfigPaths: true,
    },
    build: {
      // Allow a strict Content-Security-Policy without inlining assets as base64.
      assetsInlineLimit: 0,
    },
    ssr: {
      optimizeDeps: {
        /**
         * Include dependencies here if they throw CJS<>ESM errors.
         * For example, for the following error:
         *
         * > ReferenceError: module is not defined
         * >   at /Users/.../node_modules/example-dep/index.js:1:1
         *
         * Include 'example-dep' in the array below.
         * @see https://vitejs.dev/config/dep-optimization-options
         */
        include: [
          'react-router > set-cookie-parser',
          'react-router > cookie',
          'react-router',
        ],
      },
    },
    server: {
      allowedHosts: [
        '.tryhydrogen.dev',
        '.ngrok-free.app',
        '.ngrok.app',
        '.trycloudflare.com',
      ],
    },
  };
});
