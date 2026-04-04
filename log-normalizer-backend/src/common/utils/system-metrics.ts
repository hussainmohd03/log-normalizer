import * as os from 'os'

export interface SystemMetrics {
  memoryUsedMb: number
  memoryTotalMb: number
  memoryPercent: number
  cpuLoadAvg1m: number
  cpuCores: number
  uptimeSeconds: number
}

export const getSystemMetrics = (): SystemMetrics => {
  const mem = process.memoryUsage()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem

  return {
    memoryUsedMb: Math.round(usedMem / 1024 / 1024),
    memoryTotalMb: Math.round(totalMem / 1024 / 1024),
    memoryPercent: Math.round((usedMem / totalMem) * 100),
    cpuLoadAvg1m: Math.round(os.loadavg()[0] * 100) / 100,
    cpuCores: os.cpus().length,
    uptimeSeconds: Math.floor(process.uptime()),
  }
}