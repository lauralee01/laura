import { Module } from '@nestjs/common';
import { WritingDeskController } from './writing-desk.controller';
import { WritingDeskService } from './writing-desk.service';

@Module({
  controllers: [WritingDeskController],
  providers: [WritingDeskService],
  exports: [WritingDeskService],
})
export class WritingDeskModule {}
