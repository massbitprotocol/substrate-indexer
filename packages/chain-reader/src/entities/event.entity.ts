import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity()
export class Event {
  constructor(partial: Partial<Event>) {
    Object.assign(this, partial);
  }

  @PrimaryColumn()
  id!: string;

  @Index()
  @Column()
  module!: string;

  @Index()
  @Column()
  event!: string;

  @Index()
  @Column({type: 'bigint'})
  blockHeight!: number;
}
