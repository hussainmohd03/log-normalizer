import { Module } from "@nestjs/common";
import { JobsModule } from "src/jobs/jobs.module";
import { QueueModule } from "src/queue/queue.module";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";

@Module({
  imports: [JobsModule, QueueModule],
  controllers: [IngestionController],
  providers: [IngestionService]
})
export class IngestionModule {}