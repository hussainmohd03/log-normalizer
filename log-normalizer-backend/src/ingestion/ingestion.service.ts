import { ForbiddenException, Injectable } from "@nestjs/common";
import { IngestBatchDto, IngestDto } from "./dto/ingest-log.dto";
import { PrismaService } from "src/database/prisma.service";
import { format } from "path";


@Injectable()
export class IngestionService {

  constructor (private prisma: PrismaService) {}

  async receiveAlert(dto: IngestDto) {
    const new_alert = await this.prisma.rawLog.create({
        data: {
          ...dto
        },
        select: { id: true }
      })
      return {"id": new_alert.id, status: "accepted" }
    } 

  async receiveBatch(dto: IngestBatchDto) {
    const created_alerts = await this.prisma.rawLog.createMany({
      data: dto.alerts.map(alert => ({
        source: dto.source,
        rawContent: alert
      }))
    }); 

    return {"count": created_alerts.count, status: "accepted"}
  }

}
