/**
 * 短信接码服务
 * 基于好助云接码平台API
 * 
 * ⚠️  【核心模块 - 项目列表功能待开发】
 * 状态: 基础功能完成，项目管理功能待完善
 * 已完成: 登录、获取手机号、接收验证码、释放号码等核心功能
 * 待开发: 获取项目列表API、项目管理、批量操作等高级功能
 * 
 * 📝 开发说明:
 * - 当前使用固定项目ID进行测试和开发
 * - 服务商可能未提供项目列表查询接口
 * - 建议使用自定义项目ID (672xxxxx格式) 进行业务开发
 * 
 * 🔄 后续开发计划:
 * 1. 确认服务商项目管理API规范
 * 2. 实现项目列表获取和缓存机制
 * 3. 添加项目权限验证功能
 * 4. 完善错误处理和重试机制
 * 
 * 最后更新: 2024年
 * 维护者: 开发团队
 */

const axios = require('axios');
const crypto = require('crypto');

class SmsCodeService {
  constructor() {
    // 直接使用环境变量中的完整URL
    this.baseUrl = process.env.SMS_CODE_SERVER || 'https://api.haozhuyun.com/sms/';
    this.username = process.env.SMS_CODE_USERNAME;
    this.password = process.env.SMS_CODE_PASSWORD;
    this.server = process.env.SMS_CODE_SERVER;
    this.token = null;
    this.tokenExpiry = null;
    
    // 缓存token，避免频繁登录
    this.tokenCache = new Map();
    
    console.log('短信接码服务初始化完成');
    console.log('服务器地址:', this.baseUrl);
  }

  /**
   * 登录获取token
   * @returns {Promise<string>} token
   */
  async login() {
    if (!this.username || !this.password) {
      throw new Error('短信接码服务用户名或密码未配置');
    }

    try {
      console.log('正在登录短信接码平台...');
      console.log('请求URL:', `${this.baseUrl}?api=login&user=${this.username}&pass=${this.password}`);
      
      const response = await axios.get(this.baseUrl, {
        params: {
          api: 'login',
          user: this.username,
          pass: this.password
        },
        timeout: 10000
      });

      console.log('登录响应:', response.data);
      const data = response.data;
      
      if (data.code === 0 || data.code === 200) {
        this.token = data.token;
        this.tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24小时有效期
        
        console.log('短信接码平台登录成功, token:', this.token);
        return this.token;
      } else {
        throw new Error(`登录失败: ${data.msg}`);
      }
    } catch (error) {
      console.error('短信接码平台登录失败:', error.message);
      if (error.response) {
        console.error('响应状态:', error.response.status);
        console.error('响应数据:', error.response.data);
      }
      throw new Error(`短信接码服务登录失败: ${error.message}`);
    }
  }

  /**
   * 确保token有效
   * @returns {Promise<string>} token
   */
  async ensureToken() {
    if (!this.token || !this.tokenExpiry || Date.now() > this.tokenExpiry) {
      await this.login();
    }
    return this.token;
  }

  /**
   * 获取账号信息
   * @returns {Promise<Object>} 账号信息
   */
  async getAccountInfo() {
    const token = await this.ensureToken();

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          api: 'getSummary',
          token: token
        },
        timeout: 10000
      });

      const data = response.data;
      
      if (data.code === 0 || data.code === 200) {
        return {
          balance: parseFloat(data.money),
          maxPhoneCount: parseInt(data.num),
          message: data.msg
        };
      } else {
        throw new Error(`获取账号信息失败: ${data.msg}`);
      }
    } catch (error) {
      console.error('获取账号信息失败:', error.message);
      throw new Error(`获取账号信息失败: ${error.message}`);
    }
  }

  /**
   * 获取手机号
   * @param {number} sid - 项目ID
   * @param {Object} options - 可选参数
   * @param {number} options.isp - 运营商 (1=移动, 5=联通, 9=电信, 14=广电, 16=虚拟运营商)
   * @param {string} options.province - 省份代码
   * @param {number} options.ascription - 号码类型 (1=虚拟, 2=实卡)
   * @param {string} options.paragraph - 限定号段 (如: "1380|1580|1880")
   * @param {string} options.exclude - 排除号段
   * @param {string} options.uid - 指定对接码
   * @returns {Promise<Object>} 手机号信息
   */
  async getPhone(sid, options = {}) {
    const token = await this.ensureToken();

    if (!sid) {
      throw new Error('项目ID不能为空');
    }

    try {
      const params = {
        api: 'getPhone',
        token: token,
        sid: sid
      };

      // 添加可选参数
      if (options.isp) params.isp = options.isp;
      if (options.province) params.Province = options.province;
      if (options.ascription) params.ascription = options.ascription;
      if (options.paragraph) params.paragraph = options.paragraph;
      if (options.exclude) params.exclude = options.exclude;
      if (options.uid) params.uid = options.uid;

      console.log(`正在获取手机号，项目ID: ${sid}`);
      
      const response = await axios.get(this.baseUrl, {
        params: params,
        timeout: 15000
      });

      const data = response.data;
      
      if (data.code === '0' || data.code === 0) {
        const phoneInfo = {
          phone: data.phone,
          sid: data.sid,
          shopName: data.shop_name,
          countryName: data.country_name,
          countryCode: data.country_code,
          countryPrefix: data.country_qu,
          uid: data.uid,
          operator: data.sp,
          location: data.phone_gsd,
          message: data.msg
        };
        
        console.log(`成功获取手机号: ${phoneInfo.phone}`);
        return phoneInfo;
      } else {
        throw new Error(`获取手机号失败: ${data.msg}`);
      }
    } catch (error) {
      console.error('获取手机号失败:', error.message);
      throw new Error(`获取手机号失败: ${error.message}`);
    }
  }

  /**
   * 指定手机号接收短信
   * @param {number} sid - 项目ID
   * @param {string} phone - 手机号
   * @returns {Promise<Object>} 手机号信息
   */
  async getSpecificPhone(sid, phone) {
    const token = await this.ensureToken();

    if (!sid || !phone) {
      throw new Error('项目ID和手机号不能为空');
    }

    try {
      console.log(`正在指定手机号接收短信: ${phone}`);
      
      const response = await axios.get(this.baseUrl, {
        params: {
          api: 'getPhone',
          token: token,
          sid: sid,
          phone: phone
        },
        timeout: 15000
      });

      const data = response.data;
      
      if (data.code === '0' || data.code === 0) {
        const phoneInfo = {
          phone: data.phone,
          sid: data.sid,
          countryName: data.country_name,
          countryCode: data.country_code,
          countryPrefix: data.country_qu,
          operator: data.sp,
          location: data.phone_gsd,
          message: data.msg
        };
        
        console.log(`成功指定手机号: ${phoneInfo.phone}`);
        return phoneInfo;
      } else {
        throw new Error(`指定手机号失败: ${data.msg}`);
      }
    } catch (error) {
      console.error('指定手机号失败:', error.message);
      throw new Error(`指定手机号失败: ${error.message}`);
    }
  }

  /**
   * 获取验证码
   * @param {number} sid - 项目ID
   * @param {string} phone - 手机号
   * @param {number} maxRetries - 最大重试次数
   * @param {number} retryInterval - 重试间隔(毫秒)
   * @returns {Promise<Object>} 验证码信息
   */
  async getMessage(sid, phone, maxRetries = 30, retryInterval = 2000) {
    const token = await this.ensureToken();

    if (!sid || !phone) {
      throw new Error('项目ID和手机号不能为空');
    }

    console.log(`正在获取验证码，手机号: ${phone}，最大重试: ${maxRetries}次`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(this.baseUrl, {
          params: {
            api: 'getMessage',
            token: token,
            sid: sid,
            phone: phone
          },
          timeout: 10000
        });

        const data = response.data;
        
        if (data.code === '0' || data.code === 0) {
          const messageInfo = {
            sms: data.sms,
            code: data.yzm,
            phone: phone,
            sid: sid,
            message: data.msg,
            attempt: attempt
          };
          
          console.log(`成功获取验证码: ${messageInfo.code}`);
          return messageInfo;
        } else if (data.msg && data.msg.includes('暂无短信')) {
          // 暂无短信，继续重试
          console.log(`第${attempt}次尝试，暂无短信，${retryInterval/1000}秒后重试...`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryInterval));
            continue;
          } else {
            throw new Error('获取验证码超时，请检查手机号是否正确或稍后重试');
          }
        } else {
          throw new Error(`获取验证码失败: ${data.msg}`);
        }
      } catch (error) {
        if (attempt === maxRetries) {
          console.error('获取验证码最终失败:', error.message);
          throw new Error(`获取验证码失败: ${error.message}`);
        }
        
        console.log(`第${attempt}次尝试失败: ${error.message}，${retryInterval/1000}秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
  }

  /**
   * 释放指定手机号
   * @param {number} sid - 项目ID
   * @param {string} phone - 手机号
   * @returns {Promise<Object>} 释放结果
   */
  async releasePhone(sid, phone) {
    const token = await this.ensureToken();

    if (!sid || !phone) {
      throw new Error('项目ID和手机号不能为空');
    }

    try {
      console.log(`正在释放手机号: ${phone}`);
      
      const response = await axios.get(this.baseUrl, {
        params: {
          api: 'cancelRecv',
          token: token,
          sid: sid,
          phone: phone
        },
        timeout: 10000
      });

      const data = response.data;
      
      if (data.code === '0' || data.code === 0 || data.code === 200) {
        console.log(`成功释放手机号: ${phone}`);
        return {
          success: true,
          message: data.msg,
          phone: phone,
          sid: sid
        };
      } else {
        throw new Error(`释放手机号失败: ${data.msg}`);
      }
    } catch (error) {
      console.error('释放手机号失败:', error.message);
      throw new Error(`释放手机号失败: ${error.message}`);
    }
  }

  /**
   * 释放全部手机号
   * @returns {Promise<Object>} 释放结果
   */
  async releaseAllPhones() {
    const token = await this.ensureToken();

    try {
      console.log('正在释放全部手机号...');
      
      const response = await axios.get(this.baseUrl, {
        params: {
          api: 'cancelAllRecv',
          token: token
        },
        timeout: 10000
      });

      const data = response.data;
      
      if (data.code === '0' || data.code === 0 || data.code === 200) {
        console.log('成功释放全部手机号');
        return {
          success: true,
          message: data.msg
        };
      } else {
        throw new Error(`释放全部手机号失败: ${data.msg}`);
      }
    } catch (error) {
      console.error('释放全部手机号失败:', error.message);
      throw new Error(`释放全部手机号失败: ${error.message}`);
    }
  }

  /**
   * 拉黑指定手机号
   * @param {number} sid - 项目ID
   * @param {string} phone - 手机号
   * @returns {Promise<Object>} 拉黑结果
   */
  async blacklistPhone(sid, phone) {
    const token = await this.ensureToken();

    if (!sid || !phone) {
      throw new Error('项目ID和手机号不能为空');
    }

    try {
      console.log(`正在拉黑手机号: ${phone}`);
      
      const response = await axios.get(this.baseUrl, {
        params: {
          api: 'addBlacklist',
          token: token,
          sid: sid,
          phone: phone
        },
        timeout: 10000
      });

      const data = response.data;
      
      if (data.code === '0' || data.code === 0) {
        console.log(`成功拉黑手机号: ${phone}`);
        return {
          success: true,
          message: data.msg,
          phone: phone,
          sid: sid
        };
      } else {
        throw new Error(`拉黑手机号失败: ${data.msg}`);
      }
    } catch (error) {
      console.error('拉黑手机号失败:', error.message);
      throw new Error(`拉黑手机号失败: ${error.message}`);
    }
  }

  /**
   * 获取运营商列表
   * @returns {Array} 运营商列表
   */
  getOperators() {
    return [
      { id: 1, name: '中国移动', code: 'mobile' },
      { id: 5, name: '联通', code: 'unicom' },
      { id: 9, name: '电信', code: 'telecom' },
      { id: 14, name: '广电', code: 'broadcast' },
      { id: 16, name: '虚拟运营商', code: 'virtual' }
    ];
  }

  /**
   * 获取省份列表
   * @returns {Array} 省份列表
   */
  getProvinces() {
    return [
      { code: '11', name: '北京' },
      { code: '12', name: '天津' },
      { code: '13', name: '河北' },
      { code: '14', name: '山西' },
      { code: '15', name: '内蒙古' },
      { code: '21', name: '辽宁' },
      { code: '22', name: '吉林' },
      { code: '23', name: '黑龙江' },
      { code: '31', name: '上海' },
      { code: '32', name: '江苏' },
      { code: '33', name: '浙江' },
      { code: '34', name: '安徽' },
      { code: '35', name: '福建' },
      { code: '36', name: '江西' },
      { code: '37', name: '山东' },
      { code: '41', name: '河南' },
      { code: '42', name: '湖北' },
      { code: '43', name: '湖南' },
      { code: '44', name: '广东' },
      { code: '45', name: '广西' },
      { code: '46', name: '海南' },
      { code: '50', name: '重庆' },
      { code: '51', name: '四川' },
      { code: '52', name: '贵州' },
      { code: '53', name: '云南' },
      { code: '54', name: '西藏' },
      { code: '61', name: '陕西' },
      { code: '62', name: '甘肃' },
      { code: '63', name: '青海' },
      { code: '64', name: '宁夏' },
      { code: '65', name: '新疆' }
    ];
  }

  /**
   * 完整的接码流程
   * @param {number} sid - 项目ID
   * @param {Object} options - 获取手机号的选项
   * @param {number} maxRetries - 获取验证码的最大重试次数
   * @returns {Promise<Object>} 完整的接码结果
   */
  async getCodeComplete(sid, options = {}, maxRetries = 30) {
    try {
      console.log(`开始完整接码流程，项目ID: ${sid}`);
      
      // 1. 获取手机号
      const phoneInfo = await this.getPhone(sid, options);
      
      // 2. 获取验证码
      const messageInfo = await this.getMessage(sid, phoneInfo.phone, maxRetries);
      
      return {
        success: true,
        phone: phoneInfo.phone,
        code: messageInfo.code,
        sms: messageInfo.sms,
        phoneInfo: phoneInfo,
        messageInfo: messageInfo,
        sid: sid
      };
    } catch (error) {
      console.error('完整接码流程失败:', error.message);
      throw error;
    }
  }
}

module.exports = SmsCodeService;