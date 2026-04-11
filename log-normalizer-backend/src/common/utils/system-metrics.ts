import * as os from 'os';

export interface SystemMetrics {
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  cpu_load_avg_1m: number;
  cpu_cores: number;
  uptime_seconds: number;
}

export const getSystemMetrics = (): SystemMetrics => {
  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();

  return {
    memory_used_mb: Math.round(usedMem / 1024 / 1024),
    memory_total_mb: Math.round(totalMem / 1024 / 1024),
    memory_percent: Math.round((usedMem / totalMem) * 100),
    cpu_load_avg_1m: Math.round(os.loadavg()[0] * 100) / 100,
    cpu_cores: os.cpus().length,
    uptime_seconds: Math.floor(process.uptime()),
  };
};
