"""Replacement pools for desensitization.

- Person names: common, serious Chinese names (not cute)
- City prefixes: recognizably fictional city names from well-known Chinese TV dramas,
  so readers immediately know the text has been desensitized.
"""

MALE_NAMES: list[str] = [
    "李建国", "王志强", "张建华", "陈国栋", "赵明远", "刘文斌",
    "周德昌", "吴家辉", "徐志远", "孙振华", "朱永红", "杨立新",
    "郑国庆", "胡耀祖", "林长青", "高建设",
]

FEMALE_NAMES: list[str] = [
    "王淑芬", "李秀兰", "张桂英", "陈美玲", "赵淑华", "刘玉珍",
    "周春梅", "吴丽娟", "徐秀英", "孙文静", "朱丹凤", "杨慧敏",
    "郑素云", "胡凤琴", "林雅兰", "高海燕",
]

# Famous fictional city names from Chinese TV dramas — instantly recognizable as fake.
FICTIONAL_CITIES: list[str] = [
    "京海",     # 狂飙
    "滨江",     # 人民的名义
    "江州",     # 人民的名义
    "临港",
    "明州",
    "南台",
    "临江",
    "和平",
    "宁川",
    "东海",
]

# Government / public institution suffixes we want to preserve while replacing the location prefix.
GOV_UNIT_SUFFIXES: list[str] = [
    "市场监督管理局",
    "公安局",
    "人民政府",
    "人民法院",
    "人民检察院",
    "税务局",
    "发展和改革委员会",
    "发改委",
    "教育局",
    "卫生健康委员会",
    "卫健委",
    "财政局",
    "审计局",
    "司法局",
    "民政局",
    "人力资源和社会保障局",
    "人社局",
    "交通运输局",
    "住房和城乡建设局",
    "住建局",
    "生态环境局",
    "农业农村局",
    "水务局",
    "文化和旅游局",
    "文旅局",
    "应急管理局",
    "统计局",
    "市场监管局",
    "海关",
    "办公厅",
    "办公室",
]
