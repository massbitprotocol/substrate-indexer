import {MigrationInterface, QueryRunner} from 'typeorm';

export class Initialize1635497826089 implements MigrationInterface {
  name = 'Initialize1635497826089';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "events" ("id" character varying NOT NULL, "module" character varying NOT NULL, "event" character varying NOT NULL, "block_height" bigint NOT NULL, CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE INDEX "IDX_03d3c02c862aa122de2c18369e" ON "events" ("module") `);
    await queryRunner.query(`CREATE INDEX "IDX_670519e3f32a57a63f0d7ba7b4" ON "events" ("event") `);
    await queryRunner.query(`CREATE INDEX "IDX_167b6de5149e479296e9ae0c20" ON "events" ("block_height") `);
    await queryRunner.query(
      `CREATE TABLE "extrinsics" ("id" character varying NOT NULL, "module" character varying NOT NULL, "call" character varying NOT NULL, "block_height" bigint NOT NULL, "success" boolean, "is_signed" boolean NOT NULL, CONSTRAINT "PK_829ed58b1c386a723b6735e43d1" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE INDEX "IDX_decba587720401e8d1a755d3d0" ON "extrinsics" ("module") `);
    await queryRunner.query(`CREATE INDEX "IDX_66a0730d15af6c5158a8500e2b" ON "extrinsics" ("call") `);
    await queryRunner.query(`CREATE INDEX "IDX_21fc95a6cdefcb0cf2f1ffde30" ON "extrinsics" ("block_height") `);
    await queryRunner.query(
      `CREATE TABLE "spec_versions" ("id" character varying NOT NULL, "block_height" bigint NOT NULL, CONSTRAINT "PK_2b8cbeca4226787e3603416529f" PRIMARY KEY ("id"))`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "spec_versions"`);
    await queryRunner.query(`DROP INDEX "IDX_21fc95a6cdefcb0cf2f1ffde30"`);
    await queryRunner.query(`DROP INDEX "IDX_66a0730d15af6c5158a8500e2b"`);
    await queryRunner.query(`DROP INDEX "IDX_decba587720401e8d1a755d3d0"`);
    await queryRunner.query(`DROP TABLE "extrinsics"`);
    await queryRunner.query(`DROP INDEX "IDX_167b6de5149e479296e9ae0c20"`);
    await queryRunner.query(`DROP INDEX "IDX_670519e3f32a57a63f0d7ba7b4"`);
    await queryRunner.query(`DROP INDEX "IDX_03d3c02c862aa122de2c18369e"`);
    await queryRunner.query(`DROP TABLE "events"`);
  }
}
