import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    apiClientId?: string;
    startedAtNs?: bigint;
    appErrorCode?: string;
  }
}
