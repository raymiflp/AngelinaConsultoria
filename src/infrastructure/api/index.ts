/**
 * Client-safe barrel for the tRPC API layer.
 *
 * Only export client-safe things here. Server-only exports (createContext,
 * createCaller) must be imported from their specific modules to prevent
 * webpack from bundling Node-only modules (postgres) into the client.
 */
export { api } from "./client";
export { TRPCProvider } from "./provider";
export type { Context } from "./context";
export type { AppRouter } from "./routers/_app";
