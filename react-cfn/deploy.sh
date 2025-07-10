aws cloudformation deploy \
  --template-file static-site.yaml \
  --stack-name KoreanWordMemorizationDistro2 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-west-2