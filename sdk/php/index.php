<?php
require_once __DIR__ . '/snpanLogic.php';

$_AID = 'kshctlN1dYoWnSjp';
$_KEY = 'PUNmJI262GQwm963xvCcDAoMGzsWnDjZ';

$SnpanSdk = new snpanLogic($_AID,$_KEY);

// 获取上传地址： 将这个地址配置前端js进行文件上传操作
$downUrl = $SnpanSdk->Getuploads('');
print_r($downUrl);

// 获取鉴权地址 GetSign
$downUrlSign = $SnpanSdk->GetSign('https://qz.snpan.cn/file/snpanmee0imgd5ves32i0.png');
print_r($downUrlSign);

// 获取文件结构 getFileList
$FileList = $SnpanSdk->getFileList('');
print_r($FileList);

// 新增文件夹 addPath
$addPath = $SnpanSdk->addPath('','');
print_r($addPath);

// 编辑文件夹 editPath
$editPath = $SnpanSdk->editPath('','','');
print_r($editPath);

// 转移文件夹 transferPath
$transferPath = $SnpanSdk->transferPath('','');
print_r($transferPath);

// 删除文件夹 delPath
$delPath = $SnpanSdk->delPath('');
print_r($delPath);

