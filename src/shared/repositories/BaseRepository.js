/**
 * 基础数据访问层抽象类
 * 定义所有数据操作的标准接口，支持未来无缝迁移到数据库
 */
class BaseRepository {
  /**
   * 创建新记录
   * @param {Object} data - 要创建的数据
   * @returns {Promise<Object>} 创建的记录（包含生成的ID）
   */
  async create(data) {
    throw new Error('create method must be implemented');
  }

  /**
   * 根据ID查找记录
   * @param {string} id - 记录ID
   * @returns {Promise<Object|null>} 找到的记录或null
   */
  async findById(id) {
    throw new Error('findById method must be implemented');
  }

  /**
   * 根据条件查找单个记录
   * @param {Object} conditions - 查询条件
   * @returns {Promise<Object|null>} 找到的记录或null
   */
  async findOne(conditions) {
    throw new Error('findOne method must be implemented');
  }

  /**
   * 根据条件查找多个记录
   * @param {Object} conditions - 查询条件
   * @param {Object} options - 查询选项（分页、排序等）
   * @returns {Promise<Array>} 记录数组
   */
  async find(conditions = {}, options = {}) {
    throw new Error('find method must be implemented');
  }

  /**
   * 更新记录
   * @param {string} id - 记录ID
   * @param {Object} updateData - 要更新的数据
   * @returns {Promise<Object|null>} 更新后的记录或null
   */
  async update(id, updateData) {
    throw new Error('update method must be implemented');
  }

  /**
   * 删除记录
   * @param {string} id - 记录ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(id) {
    throw new Error('delete method must be implemented');
  }

  /**
   * 统计记录数量
   * @param {Object} conditions - 查询条件
   * @returns {Promise<number>} 记录数量
   */
  async count(conditions = {}) {
    throw new Error('count method must be implemented');
  }

  /**
   * 检查记录是否存在
   * @param {Object} conditions - 查询条件
   * @returns {Promise<boolean>} 是否存在
   */
  async exists(conditions) {
    const record = await this.findOne(conditions);
    return record !== null;
  }
}

module.exports = BaseRepository;