import {Injectable} from '@nestjs/common';
import {Pool} from 'pg';

@Injectable()
export class IndexerService {
  constructor(private readonly pool: Pool) {}

  async getIndexerSchema(id: string): Promise<string> {
    const {rows} = await this.pool.query(
      `select *
       from public.indexers
       where id = $1`,
      [id]
    );
    return rows[0].db_schema;
  }
}
