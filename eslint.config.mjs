import vitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [...vitals, ...typescript, { ignores: [".next/**", "drizzle/**"] }];

export default config;
