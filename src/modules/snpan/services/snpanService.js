const axios = require('axios');

class SnpanService {
  constructor(accountAid, accountKey, uploadAid, uploadKey) {
    // 账户秘钥 (用于查看文件目录和获取上传地址)
    this.accountAid = accountAid;
    this.accountKey = accountKey;
    
    // 上传秘钥 (可用于平台上传相关操作，保留字段但本模块不强依赖)
    this.uploadAid = uploadAid;
    this.uploadKey = uploadKey;
    
    this.accountAuthcode = null;
    this.uploadAuthcode = null;
    this.baseUrl = 'https://api.snpan.com/opapi/';
    
    // 初始化认证码（保持原行为）
    this.initializeAuth();
  }

  /**
   * 初始化认证码
   */
  async initializeAuth() {
    try {
      // 初始化账户认证码
      const accountResponse = await this.getAuthCode(this.accountAid, this.accountKey);
      if (accountResponse.code === 200) {
        this.accountAuthcode = accountResponse.data;
      } else {
        console.error('获取账户秘钥失败:', accountResponse.msg, '(代码:', accountResponse.code, ')');
      }
      
      // 初始化上传认证码（保留获取，但本模块不强依赖）
      const uploadResponse = await this.getAuthCode(this.uploadAid, this.uploadKey);
      if (uploadResponse.code === 200) {
        this.uploadAuthcode = uploadResponse.data;
      } else {
        console.error('获取上传秘钥失败:', uploadResponse.msg, '(代码:', uploadResponse.code, ')');
      }
    } catch (error) {
      console.error('初始化认证失败:', error.message);
    }
  }

  /**
   * 获取AuthCode
   * @param {string} aid AID
   * @param {string} key KEY
   * @returns {Promise<Object>} 认证响应
   */
  async getAuthCode(aid, key) {
    try {
      const response = await axios.get(this.baseUrl + 'GetAuthCode', {
        params: { aid, key },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      return { code: 500, msg: '获取AuthCode失败', error: error.message };
    }
  }

  /**
   * 通用请求函数（使用账户认证）
   * @param {string} url 请求地址
   * @param {string} method 请求方式 (GET|POST)
   * @param {Object} params 请求参数
   * @param {Object} headers 自定义请求头
   * @param {number} timeout 超时时间(秒)
   * @returns {Promise<Object>} 返回结果
   */
  async sendRequest(url, method = 'POST', params = {}, headers = {}, timeout = 10) {
    try {
      // 添加账户认证码到参数
      if (this.accountAuthcode) {
        params.authcode = this.accountAuthcode;
      }

      const fullUrl = this.baseUrl + url;

      const config = {
        method: method,
        url: fullUrl,
        timeout: timeout * 1000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...headers
        }
      };

      if (method === 'GET') {
        config.params = params;
      } else {
        const formData = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          formData.append(key, value);
        }
        config.data = formData;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        // 返回服务端错误信息
        return { code: error.response.status, msg: '请求失败', error: error.response.data };
      }
      return { code: 500, msg: '请求失败', error: error.message };
    }
  }

  /**
   * 获取上传地址（回退为基于账户认证，返回字符串URL）
   * @param {string} fid 上传至哪个文件夹，传文件夹ID，不传默认根目录
   * @returns {Promise<string|null>} 上传地址字符串；失败返回 null
   */
  async getUploadUrl(fid = '') {
    try {
      const response = await this.sendRequest('Getuploads', 'GET', { fid });
      if (response && response.code === 200 && response.data && response.data.url && response.data.query) {
        return response.data.url + '/upload?' + response.data.query;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 获取文件结构列表
   */
  async getFileList(fid = '', type = 1, sortname = '', sorttype = '', page = 1, pagesize = 20) {
    try {
      const response = await this.sendRequest('getFileList', 'GET', {
        fid, type, sortname, sorttype, page, pagesize
      });
      if (response.code === 200) {
        return response.data;
      } else {
        return null;
      }
    } catch (error) {
      return { code: 500, msg: '获取文件列表失败', error: error.message };
    }
  }

  /**
   * 新增文件夹（使用账户认证）
   */
  async addPath(fid = '', name = '') {
    try {
      const response = await this.sendRequest('addPath', 'POST', {
        c_fid: fid,
        c_name: name
      });
      if (response.code === 200) {
        return response.data;
      } else {
        return null;
      }
    } catch (error) {
      return { code: 500, msg: '新增文件夹失败', error: error.message };
    }
  }

  /**
   * 编辑文件信息
   */
  async editPath(id, name, key) {
    try {
      const response = await this.sendRequest('editPath', 'POST', {
        id,
        c_name: name,
        c_key: key
      });
      if (response.code === 200) {
        return response.data;
      } else {
        return null;
      }
    } catch (error) {
      return { code: 500, msg: '编辑文件失败', error: error.message };
    }
  }

  /**
   * 转移文件/文件夹
   */
  async transferPath(id, fid) {
    try {
      const response = await this.sendRequest('transferPath', 'POST', { id, fid });
      if (response.code === 200) {
        return response.data;
      } else {
        return null;
      }
    } catch (error) {
      return { code: 500, msg: '转移文件失败', error: error.message };
    }
  }

  /**
   * 删除文件/文件夹
   */
  async delPath(id) {
    try {
      const response = await this.sendRequest('delPath', 'POST', { id });
      if (response.code === 200) {
        return response.data;
      } else {
        return null;
      }
    } catch (error) {
      return { code: 500, msg: '删除文件失败', error: error.message };
    }
  }

  /**
   * 获取鉴权链接
   */
  async getSign(file) {
    try {
      const response = await this.sendRequest('GetSign', 'GET', { file });
      if (response.code === 200) {
        return response.data;
      } else {
        return null;
      }
    } catch (error) {
      return { code: 500, msg: '获取鉴权链接失败', error: error.message };
    }
  }
}

module.exports = SnpanService;