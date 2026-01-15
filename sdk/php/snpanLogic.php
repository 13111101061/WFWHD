<?php
class snpanLogic {
    private $aid;
    private $key;
    private $authcode;

    public function __construct($aid, $key)
    {
        $this->aid = $aid;
        $this->key = $key;
        $this->createSnpan();
    }

    /**
     * 通用请求函数
     * @param string $url 请求地址
     * @param string $method 请求方式 (GET|POST)
     * @param array $params 请求参数
     * @param array $headers 自定义请求头
     * @param int $timeout 超时时间(秒)
     * @return array 返回
     *
     */
    private function sendRequest($url, $method = 'POST', $params = [], $headers = [], $timeout = 10)
    {
        try {
            $ch = curl_init();

            $method = strtoupper($method);
            $url = 'https://api.snpan.com/opapi/' . $url;

            // 增加 authcode
            if (!empty($this->authcode)) {
                $params['authcode'] = $this->authcode;
            }

            if ($method === 'GET' && !empty($params)) {
                $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($params);
            }

            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);

            if ($method === 'POST') {
                curl_setopt($ch, CURLOPT_POST, true);
                if (!empty($params)) {
                    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
                }
            }

            if (!empty($headers)) {
                curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            }

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error    = curl_error($ch);

            curl_close($ch);

            return json_decode($response, true);
        } catch (\Exception $e) {
            error_log($e->getMessage());
            return ['code'=>500, 'msg'=>'请求失败', 'error'=>$e->getMessage()];
        }
    }

    /**
     * 获取 AUTHCODE
     */
    private function createSnpan()
    {
        $res = $this->sendRequest('GetAuthCode','GET',[
            'aid'=>$this->aid,
            'key'=>$this->key
        ]);
        if($res['code'] == 200){
            $this->authcode = $res['data'];
        }else{
            error_log('获取秘钥失败: ' . $res['msg']);
        }
    }

    /**
     * 获取上传地址
     * @param string $fid 上传至哪个文件夹，传文件夹ID，不传默认根目录
     */
    public function Getuploads($fid)
    {
        try {
            $res = $this->sendRequest('Getuploads','GET',[
                'fid'=>$fid
            ]);
            if($res['code'] == 200){
               return $res['data']['url'] . '/upload?' . $res['data']['query'];
            }else{
                error_log('获取地址: ' . $res['msg']);
            }
        } catch (\Exception $e) {
            error_log($e->getMessage());
            return ['code'=>500, 'msg'=>'获取地址', 'error'=>$e->getMessage()];
        }
    }


    /**
     * 获取文件结构列表 /opapi/getFileList
     * @param string $fid 上级目录ID，不传则返回根目录，回收站不支持传入此值
     * @param string $type 1: 正常文件列表，3：回收站列表
     * @param string $sortname 排序字段名称
     * @param string $sorttype 排序方式，asc,desc
     * @param string $page 页码
     * @param string $pagesize 每页条数
     * */
    public function getFileList($fid,$type = 1,$sortname = '',$sorttype = '',$page = 1,$pagesize = 20)
    {
        try {
            $res = $this->sendRequest('getFileList','GET',[
                'fid'=>$fid,
                'type'=>$type,
                'sortname'=>$sortname,
                'sorttype'=>$sorttype,
                'page'=>$page,
                'pagesize'=>$pagesize
            ]);
            if($res['code'] == 200){
                return $res['data'];
            }else{
                error_log('获取列表失败: ' . $res['msg']);
            }
        } catch (\Exception $e) {
            error_log($e->getMessage());
            return ['code'=>500, 'msg'=>'获取列表失败', 'error'=>$e->getMessage()];
        }
    }

    /**
     * 新增文件结构信息 /opapi/addPath
     * @param string $fid 上级目录ID，不传则新增到根目录
     * @param string $type 文件夹名称
     * */
    public function addPath($fid,$name)
    {
        try {
            $res = $this->sendRequest('addPath','POST',[
                'c_fid'=>$fid,
                'c_name'=>$name,
            ]);
            if($res['code'] == 200){
                return $res['data'];
            }else{
                error_log('新增失败: ' . $res['msg']);
            }
        } catch (\Exception $e) {
            error_log($e->getMessage());
            return ['code'=>500, 'msg'=>'新增失败', 'error'=>$e->getMessage()];
        }
    }


    /**
     * 编辑文件信息 /opapi/editPath
     * @param string $id 文件/文件夹的ID
     * @param string $name 文件名称
     * @param string $key 文件编码
     **/
    public function editPath($id,$name,$key)
    {
        try {
            $res = $this->sendRequest('editPath','POST',[
                'id'=>$id,
                'c_name'=>$name,
                'c_key'=>$key
            ]);
            if($res['code'] == 200){
                return $res['data'];
            }else{
                error_log('编辑失败: ' . $res['msg']);
            }
        } catch (\Exception $e) {
            error_log($e->getMessage());
            return ['code'=>500, 'msg'=>'编辑失败', 'error'=>$e->getMessage()];
        }
    }

    /**
     * 转移文件/文件夹 /opapi/transferPath
     * @param string $id 文件/文件夹的ID
     * @param string $fid 指定文件/文件夹的ID
     * */
    public function transferPath($id,$fid)
    {
        try {
            $res = $this->sendRequest('transferPath','POST',[
                'id'=>$id,
                'fid'=>$fid,
            ]);
            if($res['code'] == 200){
                return $res['data'];
            }else{
                error_log('转移失败: ' . $res['msg']);
            }
        } catch (\Exception $e) {
            error_log($e->getMessage());
            return ['code'=>500, 'msg'=>'转移失败', 'error'=>$e->getMessage()];
        }
    }


    /**
     * 删除文件夹/文件 /opapi/delPath
     * @param string $id 文件/文件夹的ID
     * */
    public function delPath($id)
    {
        try {
            $res = $this->sendRequest('delPath','POST',[
                'id'=>$id,
            ]);
            if($res['code'] == 200){
                return $res['data'];
            }else{
                error_log('转移失败: ' . $res['msg']);
            }
        } catch (\Exception $e) {
            error_log($e->getMessage());
            return ['code'=>500, 'msg'=>'转移失败', 'error'=>$e->getMessage()];
        }
    }

    /**
     * 获取鉴权链接 /opapi/GetSign
     * @param string $file 例如https://xxxx.com/xxx.zip 或xxx.zip 或xxx
     * */
    public function GetSign($file)
    {
        try {
            $res = $this->sendRequest('GetSign','GET',[
                'file'=>$file,
            ]);
            if($res['code'] == 200){
                return $res['data'];
            }else{
                error_log('转移失败: ' . $res['msg']);
            }
        } catch (\Exception $e) {
            error_log($e->getMessage());
            return ['code'=>500, 'msg'=>'转移失败', 'error'=>$e->getMessage()];
        }
    }

}
