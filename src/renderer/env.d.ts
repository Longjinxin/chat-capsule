import type { CapsuleApi } from '../shared/types';

declare global {
  interface Window {
    capsuleApi: CapsuleApi;
  }
}

export {};
