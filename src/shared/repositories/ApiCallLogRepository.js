const BaseRepository = require('./BaseRepository');

/**
 * API调用记录数据访问层抽象接口
 * 定义API调用记录相关的所有数据操作
 */
class ApiCallLogRepository extends BaseRepository {
  /**
   * 根据用户ID查找调用记录
   * @param {string} userId - 用户ID
   * @param {Object} options - 查询选项（分页、时间范围等）
   * @returns {Promise<Array>} 调用记录列表
   */
  async findByUserId(userId, options = {}) {
    return await this.find({ userId }, options);
  }

  /**
   * 根据用户名查找调用记录
   * @param {string} username - 用户名
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 调用记录列表
   */
  async findByUsername(username, options = {}) {
    return await this.find({ username }, options);
  }

  /**
   * 根据服务名称查找调用记录
   * @param {string} serviceName - 服务名称
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 调用记录列表
   */
  async findByService(serviceName, options = {}) {
    return await this.find({ serviceName }, options);
  }

  /**
   * 根据时间范围查找调用记录
   * @param {Date} startDate - 开始时间
   * @param {Date} endDate - 结束时间
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 调用记录列表
   */
  async findByDateRange(startDate, endDate, options = {}) {
    throw new Error('findByDateRange method must be implemented');
  }

  /**
   * 获取用户在指定时间段内的调用次数
   * @param {string} userId - 用户ID
   * @param {Date} startDate - 开始时间
   * @param {Date} endDate - 结束时间
   * @returns {Promise<number>} 调用次数
   */
  async countUserCalls(userId, startDate, endDate) {
    throw new Error('countUserCalls method must be implemented');
  }

  /**
   * 获取服务调用统计
   * @param {Object} options - 统计选项（时间范围、分组方式等）
   * @returns {Promise<Array>} 统计结果
   */
  async getServiceStats(options = {}) {
    throw new Error('getServiceStats method must be implemented');
  }

  /**
   * 获取用户调用统计
   * @param {Object} options - 统计选项
   * @returns {Promise<Array>} 统计结果
   */
  async getUserStats(options = {}) {
    throw new Error('getUserStats method must be implemented');
  }

  /**
   * 获取错误调用记录
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 错误调用记录列表
   */
  async findErrors(options = {}) {
    throw new Error('findErrors method must be implemented');
  }

  /**
   * 批量创建调用记录
   * @param {Array} records - 调用记录数组
   * @returns {Promise<Array>} 创建的记录
   */
  async createBatch(records) {
    throw new Error('createBatch method must be implemented');
  }

  /**
   * 清理旧的调用记录
   * @param {Date} beforeDate - 清理此日期之前的记录
   * @returns {Promise<number>} 清理的记录数量
   */
  async cleanupOldRecords(beforeDate) {
    throw new Error('cleanupOldRecords method must be implemented');
  }

  /**
   * 获取实时统计信息
   * @returns {Promise<Object>} 实时统计数据
   */
  async getRealTimeStats() {
    throw new Error('getRealTimeStats method must be implemented');
  }
}

module.exports = ApiCallLogRepository;