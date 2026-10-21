import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFaqIntent } from '../src/rag/faqIntentIndex.js';

test('vehicle-license loss stays separate from driver-license loss', async () => {
  const vehicle = await matchFaqIntent('رخصة العربية ضاعت، ينفع بدل فاقد؟');
  assert.ok(vehicle);
  assert.ok(vehicle.references.includes('MOI-HOME'));
  assert.equal(vehicle.intent, 'lost_vehicle_license');

  const driver = await matchFaqIntent('رخصة القيادة ضاعت، أعمل بدل فاقد منين؟');
  assert.ok(driver);
  assert.ok(driver.references.includes('MOI-ESERVICES'));
  assert.equal(driver.intent, 'lost_driver_license');
});

test('paraphrased vehicle vs driver licence wording remains disambiguated', async () => {
  const vehicle = await matchFaqIntent('عايز بدل فاقد لرخصة العربية');
  assert.ok(vehicle);
  assert.ok(vehicle.references.includes('MOI-HOME'));

  const driver = await matchFaqIntent('عايز بدل فاقد لرخصة السواقة');
  assert.ok(driver);
  assert.ok(driver.references.includes('MOI-ESERVICES'));
});
