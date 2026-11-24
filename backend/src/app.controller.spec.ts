import { BadRequestException, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SessionPreferencesService } from './chat/session-preferences.service';
import { ReverseGeocodeService } from './integrations/geocode/reverse-geocode.service';

function reqWithSession(sessionId: string): Request {
  return { lauraSessionId: sessionId } as unknown as Request;
}

describe('AppController', () => {
  let appController: AppController;
  let setLocation: jest.Mock;
  let reverse: jest.Mock;

  beforeEach(async () => {
    setLocation = jest.fn();
    reverse = jest.fn(async () => 'Boston, MA');

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
            setLocation,
            clearLocation: jest.fn(),
            setTone: jest.fn(),
            setDefaultMeetingMinutes: jest.fn(),
          },
        },
        { provide: ReverseGeocodeService, useValue: { reverse } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('POST session/location/detect', () => {
    it('stores only the city label, with rounded coordinates sent to the geocoder', async () => {
      const result = await appController.detectLocation(reqWithSession('s1'), {
        latitude: 42.360123,
        longitude: -71.058891,
      });

      expect(result).toEqual({ ok: true, location: 'Boston, MA' });
      expect(reverse).toHaveBeenCalledWith(42.36, -71.06);
      expect(setLocation).toHaveBeenCalledWith('s1', 'Boston, MA');
    });

    it('rejects invalid coordinates without calling the geocoder', async () => {
      await expect(
        appController.detectLocation(reqWithSession('s1'), {
          latitude: 'abc',
          longitude: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        appController.detectLocation(reqWithSession('s1'), {
          latitude: 200,
          longitude: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(reverse).not.toHaveBeenCalled();
      expect(setLocation).not.toHaveBeenCalled();
    });

    it('does not overwrite the stored location when the geocoder finds nothing', async () => {
      reverse.mockResolvedValueOnce(null);

      await expect(
        appController.detectLocation(reqWithSession('s1'), {
          latitude: 0,
          longitude: 0,
        }),
      ).rejects.toBeInstanceOf(HttpException);
      expect(setLocation).not.toHaveBeenCalled();
    });

    it('rate-limits a single session', async () => {
      const body = { latitude: 42.36, longitude: -71.06 };

      for (let i = 0; i < 6; i += 1) {
        await appController.detectLocation(reqWithSession('s1'), body);
      }
      await expect(
        appController.detectLocation(reqWithSession('s1'), body),
      ).rejects.toMatchObject({ status: 429 });

      // A different session is unaffected.
      await expect(
        appController.detectLocation(reqWithSession('s2'), body),
      ).resolves.toMatchObject({ ok: true });
    });
  });
});
