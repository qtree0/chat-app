import * as client from "prom-client"

const collectDefaultMetrics = client.collectDefaultMetrics;

collectDefaultMetrics();

export const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [50, 100, 200, 300, 400, 500, 1000]
});

export const connectedSocketsGauge = new client.Gauge({
  name: 'socket_connected_clients',
  help: 'Number of currently connected WebSocket clients'
});

export const register = client.register;

