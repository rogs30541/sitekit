// Workers 上不需要的 Node 選用相依（@nestjs/common 的 ValidationPipe 等 lazy require）：以空模組取代
export default {};
