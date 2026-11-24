import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SessionPreferencesService } from './chat/session-preferences.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: SessionPreferencesService,
          useValue: {
            setTimeZone: jest.fn(),
            getSessionPrefs: jest.fn(async () => ({
              timeZone: null,
              location: null,
              tone: 'warm',
              defaultMeetingMinutes: 60,
            })),
            setLocation: jest.fn(),
            clearLocation: jest.fn(),
            setTone: jest.fn(),
            setDefaultMeetingMinutes: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
